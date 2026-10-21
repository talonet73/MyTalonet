import { timelineTools, applyTimelineTool } from './timelineTools';
import { TimelineClip, Track, SubtitleItem, ClaudePromptMessage } from '../types/editor';

export interface MCPToolCallResult {
  message: string;
  actionExecuted?: string;
  updatedClips?: TimelineClip[];
  updatedTracks?: Track[];
  updatedTime?: number;
  updatedSubtitles?: SubtitleItem[];
  selectedClipId?: string | null;
}

export const CLAUDE_MCP_CONFIG = {
  serverName: "taledit-video-editor-mcp",
  version: "1.0.0",
  protocolVersion: "2024-11-05",
  endpoints: {
    sse: "/api/mcp/sse",
    messages: "/api/mcp/messages"
  },
  availableTools: timelineTools
};

// Generates the JSON snippet to paste into claude_desktop_config.json
export function getClaudeDesktopConfigJson(hostUrl: string): string {
  const origin = hostUrl || 'http://localhost:3000';
  return JSON.stringify(
    {
      mcpServers: {
        taledit: {
          command: "npx",
          args: [
            "-y",
            "mcp-remote",
            `${origin}/api/mcp/sse`
          ],
          env: {
            APP_NAME: "TALEDIT",
            EDITOR_MODE: "ACTIVE"
          }
        }
      }
    },
    null,
    2
  );
}

// Intelligent prompt interpreter for video editing commands
export function executeClaudePrompt(
  prompt: string,
  clips: TimelineClip[],
  tracks: Track[],
  currentTime: number,
  selectedClipId: string | null,
  subtitles: SubtitleItem[]
): MCPToolCallResult {
  const text = prompt.toLowerCase().trim();

  // 1. Cut / Taglia
  if (text.includes('taglia') || text.includes('cut') || text.includes('dividi') || text.includes('split')) {
    // Check if time specified
    let targetTime = currentTime;
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      targetTime = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
    } else {
      const secMatch = text.match(/(\d+)\s*(s|sec|secondi)/);
      if (secMatch) {
        targetTime = parseInt(secMatch[1], 10);
      }
    }

    // Find clip to cut
    let clipToCut = clips.find(c => c.id === selectedClipId);
    if (!clipToCut) {
      clipToCut = clips.find(c => targetTime >= c.startTime && targetTime <= c.startTime + c.duration);
    }

    if (clipToCut && targetTime > clipToCut.startTime && targetTime < clipToCut.startTime + clipToCut.duration) {
      const result = applyTimelineTool({ clips, tracks, currentTime, selectedClipId: clipToCut.id, subtitles, mediaAssets: [], aspectRatio: '16:9' }, 'cut_clip_at_time', { clipId: clipToCut.id, timeSeconds: targetTime });
      return { message: `Clip e audio collegato tagliati a ${formatTimecode(targetTime)}.`, actionExecuted: 'cut_clip_at_time', updatedClips: result.clips, updatedTime: targetTime, selectedClipId: result.selectedClipId || undefined };
    } else {
      return {
        message: `Non è stata trovata alcuna clip tagliabile al tempo ${formatTimecode(targetTime)}. Posiziona prima il playhead sopra una clip o specifica il nome.`,
        actionExecuted: 'cut_error'
      };
    }
  }

  // 2. Transparency / Trasparenza / Opacità
  if (text.includes('trasparen') || text.includes('opacit') || text.includes('opacity')) {
    const percentMatch = text.match(/(\d+)\s*%/);
    let targetPercent = 50;
    if (percentMatch) {
      targetPercent = Math.min(100, Math.max(0, parseInt(percentMatch[1], 10)));
    } else {
      const numMatch = text.match(/\b([0-9]{1,3})\b/);
      if (numMatch) {
        targetPercent = Math.min(100, Math.max(0, parseInt(numMatch[1], 10)));
      }
    }

    // Find video clip
    let targetClip = clips.find(c => c.id === selectedClipId && c.type === 'video');
    if (!targetClip) {
      targetClip = clips.find(c => c.type === 'video');
    }

    if (targetClip) {
      const updated = clips.map(c => 
        c.id === targetClip!.id ? { ...c, transparency: targetPercent } : c
      );

      return {
        message: `Maniglia orizzontale di trasparenza per "${targetClip.name}" impostata al ${targetPercent}%. La maniglia grafica sulla timeline è stata aggiornata.`,
        actionExecuted: `set_transparency("${targetClip.name}", ${targetPercent}%)`,
        updatedClips: updated,
        selectedClipId: targetClip.id
      };
    }
  }

  // 3. Volume / Decibel / Audio
  if (text.includes('volume') || text.includes('decibel') || text.includes('db') || text.includes('audio')) {
    const dbMatch = text.match(/([+-]?\d+(?:\.\d+)?)\s*(?:db|decibel)?/i);
    let targetDb = 0;
    if (dbMatch && text.match(/[+-]?\d+/)) {
      targetDb = Math.min(12, Math.max(-60, parseFloat(dbMatch[1])));
    } else if (text.includes('muto') || text.includes('mute') || text.includes('azzera')) {
      targetDb = -60;
    } else if (text.includes('alza') || text.includes('aumenta')) {
      targetDb = 3;
    } else if (text.includes('abbassa')) {
      targetDb = -6;
    }

    let targetClip = clips.find(c => c.id === selectedClipId && c.type === 'audio');
    if (!targetClip) {
      targetClip = clips.find(c => c.type === 'audio');
    }

    if (targetClip) {
      const updated = clips.map(c => 
        c.id === targetClip!.id ? { ...c, volumeDb: targetDb } : c
      );

      return {
        message: `Maniglia orizzontale del volume per "${targetClip.name}" impostata a ${targetDb >= 0 ? `+${targetDb}` : targetDb} dB. Il feedback visivo della maniglia sulla clip verde è sincronizzato.`,
        actionExecuted: `set_volume("${targetClip.name}", ${targetDb} dB)`,
        updatedClips: updated,
        selectedClipId: targetClip.id
      };
    }
  }

  // 4. Dissolvenza / Fade in / Fade out
  if (text.includes('dissolvenza') || text.includes('fade') || text.includes('sfuma')) {
    const durationMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secondi)?/);
    let fadeDuration = 1.5;
    if (durationMatch) {
      fadeDuration = parseFloat(durationMatch[1]);
    }

    let targetClip = clips.find(c => c.id === selectedClipId && c.type === 'effect');
    if (!targetClip) {
      targetClip = clips.find(c => c.type === 'effect');
    }

    if (targetClip) {
      const updated = clips.map(c => 
        c.id === targetClip!.id ? { ...c, fadeIn: fadeDuration, fadeOut: fadeDuration } : c
      );

      return {
        message: `Maniglie verticali laterali di dissolvenza aggiornate su "${targetClip.name}": Fade In e Fade Out impostati a ${fadeDuration}s con curva grafica attiva.`,
        actionExecuted: `set_dissolvenza("${targetClip.name}", ${fadeDuration}s)`,
        updatedClips: updated,
        selectedClipId: targetClip.id
      };
    }
  }

  // 5. Add Effect / Aggiungi Effetto
  if (text.includes('effetto') || text.includes('effect') || text.includes('camera') || text.includes('glitch') || text.includes('blur')) {
    const clock=text.match(/(\d{1,2}):(\d{2})/);
    const start=clock ? Number(clock[1])*60+Number(clock[2]) : currentTime;
    const visual=clips.find(c=>['video','image'].includes(c.type) && start>=c.startTime && start<c.startTime+c.duration);
    if(!visual)return {message:'Nessun video o immagine al tempo richiesto: aggiungi una clip o sposta il cursore.'};
    const effectTrack=tracks.find(t=>t.type==='effect') || {id:crypto.randomUUID(),name:'EFFECTS',type:'effect' as const,isSolo:false,isMuted:false,headerBg:'#35121b',laneBg:'#1e141a'};
    const newEffect: TimelineClip = {
      id: `effect_${Date.now()}`,
      name: text.includes('glitch') ? 'Glitch Cyber' : text.includes('blur') ? 'Motion Blur' : 'Camera Handed FX',
      trackId: effectTrack.id,
      type: 'effect',
      startTime: start,
      duration: Math.min(6,visual.startTime+visual.duration-start),
      offset: 0,
      color: '#d9534f',
      transparency: 100,
      volumeDb: 0,
      fadeIn: 1.2,
      fadeOut: 1.2,
      effectType: text.includes('glitch') ? 'glitch' : text.includes('blur') ? 'blur' : 'camera_shake'
    };

    const updated = [...clips, newEffect];
    return {
      message: `Aggiunto nuovo effetto "${newEffect.name}" sulla pista rossa EFFECTS a ${formatTimecode(start)} con maniglie di dissolvenza laterali attive.`,
      updatedTracks: tracks.some(t=>t.id===effectTrack.id)?tracks:[...tracks,effectTrack],
      actionExecuted: `add_effect("${newEffect.name}")`,
      updatedClips: updated,
      selectedClipId: newEffect.id
    };
  }

  // 6. Subtitles / Sottotitoli
  if (text.includes('sottotitol') || text.includes('caption') || text.includes('traduci') || text.includes('lingua')) {
    return { message: 'Apri il pannello Captions e premi GENERATE per trascrivere realmente l’audio della timeline.', actionExecuted: undefined };
  }

  // 7. Delete / Elimina / Cestino
  if (text.includes('elimina') || text.includes('cancella') || text.includes('delete') || text.includes('cestino')) {
    if (selectedClipId) {
      const deletedClip = clips.find(c => c.id === selectedClipId);
      const result=applyTimelineTool({clips,tracks,currentTime,selectedClipId,subtitles,mediaAssets:[],aspectRatio:'16:9'},'delete_clip',{});
      return {message:`Clip "${deletedClip?.name || selectedClipId}" rimossa dalla timeline.`,actionExecuted:'delete_clip',updatedClips:result.clips,selectedClipId:null};
    } else {
      return {
        message: "Nessuna clip attualmente selezionata. Seleziona prima un mattoncino sulla timeline per eliminarlo.",
        actionExecuted: 'delete_none'
      };
    }
  }

  // 8. Seek / Sposta Playhead
  if (text.includes('vai a') || text.includes('sposta') || text.includes('seek') || text.includes('secondi') || text.includes(':')) {
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    let targetTime = 0;
    if (timeMatch) {
      targetTime = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
    } else {
      const secMatch = text.match(/(\d+)\s*(s|sec|secondi)/);
      if (secMatch) {
        targetTime = parseInt(secMatch[1], 10);
      }
    }

    return {
      message: `Playhead spostato al tempo ${formatTimecode(targetTime)}.`,
      actionExecuted: `seek_time(${formatTimecode(targetTime)})`,
      updatedTime: targetTime
    };
  }

  // Default fallback conversational response with suggestions
  return {
    message: `Ricevuto comando da prompt: "${prompt}". Ho analizzato la timeline di TALEDIT. Puoi impartirmi ordini come:
• "Taglia la clip al playhead"
• "Imposta trasparenza video all'80%"
• "Alza volume audio a +3 dB"
• "Applica dissolvenza di 1.8s all'effetto"
• "Aggiungi effetto Glitch"
• "Genera sottotitoli in Italiano"
• "Vai a 00:20"`,
    actionExecuted: 'claude_consult'
  };
}

export function formatTimecode(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 30);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function formatSecondsToMinSec(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
