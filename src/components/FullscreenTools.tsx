import {useEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
/** Move one persistent portal host: changing fullscreen never remounts tool windows. */
export function FullscreenTools({children}:{children:ReactNode}){
  const [container]=useState(()=>{const el=document.createElement('div');el.dataset.toolWindows='true';el.style.display='contents';return el;});
  useEffect(()=>{const move=()=>{const full=document.fullscreenElement;(full&&full!==document.documentElement?full:document.body).appendChild(container);};move();document.addEventListener('fullscreenchange',move);return()=>{document.removeEventListener('fullscreenchange',move);container.remove();};},[container]);
  return createPortal(children,container);
}
