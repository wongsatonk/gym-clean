// Camera access. Frames stay in this tab: nothing is recorded or uploaded (CLAUDE.md privacy rule).
export type Facing = 'user' | 'environment';

export async function openCamera(video: HTMLVideoElement, facing: Facing): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: facing,
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
