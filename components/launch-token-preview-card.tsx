"use client";

import {LaunchNetworkStamp} from "./launch-network-logo";
import type {PickerNetworkId} from "@/lib/chain/launch-network-picker.ts";
import {GrainStage,grainWord,type GrainMode} from './grain-stage';

/** The same live token card for regular and protected launch drafts. */
export function LaunchTokenPreviewCard({mode,stageLabel,name,symbol,description,image,networkId}:{mode:GrainMode;stageLabel:string;name:string;symbol:string;description:string;image?:string;networkId?:PickerNetworkId}){
 return <div className="gx-preview-card gx-light">
  {networkId&&<LaunchNetworkStamp networkId={networkId}/>}
  <div className="gx-preview-stage"><GrainStage mode={mode} word={grainWord(name)} palette="light" floor={.14} kick={name.length+description.length}/><span className="gx-mono gx-mute">{stageLabel}</span></div>
  <div className="gx-preview-id">{image?<img className="token-mark image" src={image} alt="Token artwork preview"/>:<div className="token-mark">{symbol.slice(0,2)||'/'}</div>}<h2>{name||'your token'}</h2><span className="ticker gx-mono">${symbol||'—'}</span></div>
  <p className="preview-description">{description||'—'}</p>
  <div className="gx-preview-mc"><strong aria-label="Market cap not available: not launched">—</strong><span className="gx-mono gx-mute">market cap · not launched</span></div>
 </div>;
}
