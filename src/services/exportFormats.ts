export const EXPORT_FORMATS={video:['mp4','mov','avi','mkv','webm','m4v'],audio:['mp3','wav','m4a','aac','flac','ogg','opus','aiff'],image:['png','jpg','webp','bmp','tiff','gif']} as const;
export type ExportCategory=keyof typeof EXPORT_FORMATS;
export type ExportFormat=typeof EXPORT_FORMATS[ExportCategory][number];
export const categoryOf=(format:string):ExportCategory=>EXPORT_FORMATS.image.includes(format as any)?'image':EXPORT_FORMATS.audio.includes(format as any)?'audio':'video';
