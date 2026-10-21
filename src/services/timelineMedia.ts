import type { TimelineClip, Track } from '../types/editor';
export function activeTimelineClips(clips: TimelineClip[], tracks: Track[]) {
  const solo = tracks.some(t => t.isSolo);
  // Keep video link metadata even when the audio track is muted, to prevent audio leaking from video.
  return clips.filter(c => { const t = tracks.find(t => t.id === c.trackId); return !t?.isMuted && (!solo || t?.isSolo); });
}
