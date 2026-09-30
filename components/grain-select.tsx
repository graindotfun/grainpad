'use client';
import {useId} from 'react';
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
 size?:'compact'|'field';className?:string;
};
/** Grainpad's one select. Radix provides the listbox semantics, keyboard support (Enter/Space/arrows/typeahead,
 * Escape), outside-click dismissal and focus return; the menu is Grainpad-styled in both themes instead of the OS menu.
 * An option with value "" is treated as the placeholder, because a listbox item cannot carry an empty value. */
export function GrainSelect({value,onValueChange,options,label,ariaLabel,id,disabled,placeholder,size='compact',className=''}:Props){
 const labelId=useId();
 const items=options.filter(o=>o.value!=='');
 const empty=options.find(o=>o.value==='')?.label;
 return <div className={`grain-select is-${size} ${className}`.trim()}>
  {label&&<span id={labelId} className="grain-select-label">{label}</span>}
  <Select.Root value={value===''?undefined:value} onValueChange={onValueChange} disabled={disabled}>
   <Select.Trigger id={id} className="grain-select-trigger" aria-labelledby={label?`${labelId}${id?` ${id}`:''}`:undefined} aria-label={label?undefined:ariaLabel}>
    <Select.Value placeholder={placeholder??empty??'Select'}/>
    <Select.Icon className="grain-select-chevron"><ChevronDown size={15} strokeWidth={1.8} aria-hidden="true"/></Select.Icon>
   </Select.Trigger>
   <Select.Portal>
    <Select.Content className="grain-select-menu" position="popper" sideOffset={6} align="start" collisionPadding={12}>
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
