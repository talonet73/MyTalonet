import {useRef,useState, type HTMLAttributes, type FormEventHandler} from 'react';

/** Moves only from the title bar. Inputs/buttons keep their normal behavior. */
export function DraggableWindow({as:Tag='div',style,children,...props}:HTMLAttributes<HTMLElement>&{as?:'div'|'section'|'form';onSubmit?:FormEventHandler}) {
  const [position,setPosition]=useState({x:0,y:0});
  const drag=useRef<{pointer:number;x:number;y:number;originX:number;originY:number;rect:DOMRect}|null>(null);
  return <Tag {...props} style={{...style,transform:`translate(${position.x}px, ${position.y}px)`}} data-draggable-window
    onPointerDown={event=>{
      const target=event.target as Element;
      if(event.button!==0 || !target.closest('[data-window-handle]') || target.closest('button,input,select,textarea,a'))return;
      event.preventDefault();event.stopPropagation();
      drag.current={pointer:event.pointerId,x:event.clientX,y:event.clientY,originX:position.x,originY:position.y,rect:event.currentTarget.getBoundingClientRect()};
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event=>{
      const d=drag.current;if(!d)return;
      const dx=Math.max(-d.rect.left,Math.min(window.innerWidth-d.rect.right,event.clientX-d.x));
      const dy=Math.max(-d.rect.top,Math.min(window.innerHeight-40-d.rect.top,event.clientY-d.y));
      setPosition({x:d.originX+dx,y:d.originY+dy});
    }}
    onPointerUp={event=>{if(drag.current){drag.current=null;event.currentTarget.releasePointerCapture(event.pointerId);}}}
    onPointerCancel={()=>{drag.current=null;}}>{children}</Tag>;
}
