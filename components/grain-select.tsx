'use client';
import {useId,useRef,useState} from 'react';
import {Select} from 'radix-ui';
import {Check,ChevronDown} from 'lucide-react';
export type GrainOption={value:string;label:string;disabled?:boolean};
type Props={
 value:string;onValueChange:(value:string)=>void;options:readonly GrainOption[];
 /** Visible label rendered beside (compact) or above (field) the trigger. Omit when an outer <label> already names it. */
 label?:string;
 /** Accessible name when there is no visible label. */
 ariaLabel?:string;
 id?:string;disabled?:boolean;placeholder?:string;
 /** compact: 38px filter control. field: full-width form control matching the form inputs. */
 size?:'compact'|'field';
 /** Which trigger edge the menu lines up with. Use "end" for a control at the right of a row. */
 align?:'start'|'end';
 className?:string;
};
// Menu size estimate for the pre-open check. Generous on purpose: an estimate that is a few pixels short lets Radix flip.
const SIDE_OFFSET=6,VIEWPORT_PADDING=12,ITEM_HEIGHT=36,MENU_CHROME=16,MENU_MAX=340,SAFETY=24;
/** Grainpad's one select. Radix provides the listbox semantics, keyboard support (Enter/Space/arrows/typeahead,
 * Escape), outside-click dismissal and focus return; the menu is Grainpad-styled in both themes instead of the OS menu.
 * The menu always opens below the trigger. If the viewport has no room below, the page scrolls just enough first;
 * the menu flips upward only when the page cannot scroll further.
 * An option with value "" is treated as the placeholder, because a listbox item cannot carry an empty value. */
export function GrainSelect({value,onValueChange,options,label,ariaLabel,id,disabled,placeholder,size='compact',align='start',className=''}:Props){
 const labelId=useId(),trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
 const items=options.filter(o=>o.value!=='');
 const empty=options.find(o=>o.value==='')?.label;
 function change(next:boolean){
  const el=trigger.current;
  if(!next||!el){setOpen(next);return;}
  const needed=Math.min(MENU_MAX,items.length*ITEM_HEIGHT+MENU_CHROME)+SIDE_OFFSET+VIEWPORT_PADDING+SAFETY;
  const below=window.innerHeight-el.getBoundingClientRect().bottom;
  const scrollable=document.documentElement.scrollHeight-(window.scrollY+window.innerHeight);
  if(below>=needed||scrollable<=0){setOpen(true);return;}
  // Make room below before Radix measures, so the menu stays attached under the trigger.
  window.scrollBy({top:Math.min(needed-below,scrollable),behavior:'instant' as ScrollBehavior});
  requestAnimationFrame(()=>setOpen(true));
 }
 return <div className={`grain-select is-${size} ${className}`.trim()}>
  {label&&<span id={labelId} className="grain-select-label">{label}</span>}
  <Select.Root value={value===''?undefined:value} onValueChange={onValueChange} disabled={disabled} open={open} onOpenChange={change}>
   <Select.Trigger ref={trigger} id={id} className="grain-select-trigger" aria-labelledby={label?`${labelId}${id?` ${id}`:''}`:undefined} aria-label={label?undefined:ariaLabel}>
    <Select.Value placeholder={placeholder??empty??'Select'}/>
    <Select.Icon className="grain-select-chevron"><ChevronDown size={15} strokeWidth={1.8} aria-hidden="true"/></Select.Icon>
   </Select.Trigger>
   <Select.Portal>
    <Select.Content className="grain-select-menu" position="popper" side="bottom" align={align} sideOffset={SIDE_OFFSET} collisionPadding={VIEWPORT_PADDING} sticky="always">
     <Select.Viewport className="grain-select-viewport">
      {items.map(o=><Select.Item key={o.value} value={o.value} disabled={o.disabled} className="grain-select-item">
       <Select.ItemText>{o.label}</Select.ItemText>
       <Select.ItemIndicator className="grain-select-check"><Check size={14} strokeWidth={2.4} aria-hidden="true"/></Select.ItemIndicator>
      </Select.Item>)}
     </Select.Viewport>
    </Select.Content>
   </Select.Portal>
  </Select.Root>
 </div>;
}
