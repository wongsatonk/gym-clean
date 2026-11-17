// node --test scripts/ios-install.test.mjs
// The pure parts of `npm run ios:install`: options, picking the iPhone, the signing file check.
// Made-up device data only (no real names or ids).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs, pickDevice, signingProblems } from './ios-install.mjs';

const dev = (
  id,
  {
    reality = 'physical',
    type = 'iPhone',
    pair = 'paired',
    tunnel = 'disconnected',
    transport = 'localNetwork',
    name = id,
  } = {},
) => ({
  identifier: id,
  deviceProperties: { name },
  hardwareProperties: { reality, deviceType: type, udid: `udid-${id}` },
  connectionProperties: { pairingState: pair, tunnelState: tunnel, transportType: transport },
});
const list = (...devices) => ({ result: { devices } });

describe('parseArgs', () => {
  it('defaults to a real Debug install from a clean tree', () => {
    assert.deepEqual(parseArgs([]), {
      device: undefined,
      dryRun: false,
      allowDirty: false,
      configuration: 'Debug',
    });
  });
  it('reads every option', () => {
    assert.deepEqual(parseArgs(['--dry-run', '--allow-dirty', '--release', '--device', 'X']), {
      device: 'X',
      dryRun: true,
      allowDirty: true,
      configuration: 'Release',
    });
  });
  it('rejects unknown options and a bare --device', () => {
    assert.throws(() => parseArgs(['--force']), /unknown option --force/);
    assert.throws(() => parseArgs(['--device']), /--device needs/);
  });
});

describe('pickDevice', () => {
  it('skips simulators, iPads and unpaired phones', () => {
    const json = list(
      dev('sim', { reality: 'simulated', tunnel: 'connected' }),
      dev('ipad', { type: 'iPad', tunnel: 'connected' }),
      dev('unpaired', { pair: 'unpaired', tunnel: 'connected' }),
      dev('phone'),
    );
    assert.equal(pickDevice(json)?.id, 'phone');
  });
  it('prefers a phone that is connected right now', () => {
    const json = list(
      dev('away'),
      dev('plugged', { transport: 'wired' }),
      dev('near', { tunnel: 'connected' }),
    );
    assert.equal(pickDevice(json)?.id, 'plugged');
  });
  it('matches --device by id, UDID or name', () => {
    const json = list(dev('a', { name: 'Phone A' }), dev('b', { name: 'Phone B' }));
    assert.equal(pickDevice(json, 'b')?.id, 'b');
    assert.equal(pickDevice(json, 'udid-a')?.id, 'a');
    assert.equal(pickDevice(json, 'Phone B')?.udid, 'udid-b');
    assert.equal(pickDevice(json, 'nope'), null);
  });
  it('returns null when there is no iPhone', () => {
    assert.equal(pickDevice(list(dev('sim', { reality: 'simulated' }))), null);
    assert.equal(pickDevice({}), null);
  });
});

describe('signingProblems', () => {
  it('accepts a filled-in file', () => {
    assert.deepEqual(
      signingProblems(
        'PRODUCT_BUNDLE_IDENTIFIER = org.someone.app\nDEVELOPMENT_TEAM = Q1W2E3R4T5\n',
      ),
      [],
    );
  });
  it('rejects the example values and a missing team', () => {
    const example =
      '// e.g. com.yourname.gymclean\nPRODUCT_BUNDLE_IDENTIFIER = com.yourname.gymclean\nDEVELOPMENT_TEAM = ABCDE12345\n';
    assert.equal(signingProblems(example).length, 2);
    assert.match(
      signingProblems('PRODUCT_BUNDLE_IDENTIFIER = org.a.b\n').join(),
      /DEVELOPMENT_TEAM is not set/,
    );
    assert.match(
      signingProblems('PRODUCT_BUNDLE_IDENTIFIER = org.a.b\nDEVELOPMENT_TEAM = short\n').join(),
      /10-character/,
    );
  });
  it('ignores commented-out values', () => {
    assert.match(
      signingProblems(
        '// DEVELOPMENT_TEAM = Q1W2E3R4T5\nPRODUCT_BUNDLE_IDENTIFIER = org.a.b\n',
      ).join(),
      /DEVELOPMENT_TEAM is not set/,
    );
  });
});
