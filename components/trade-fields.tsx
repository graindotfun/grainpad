'use client';
import type {ReactNode} from 'react';
import {ArrowDownUp} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
/** Shared purchase controls; chain adapters own balances, quotes and execution. */
export function TradeFields({symbol,paymentSymbol,side,setSide,amount,setAmount,inputId,disabled=false,amountDisabled=disabled,sideDisabled=disabled,balanceLabel,output,outputHint,paymentOptions,percentages,onReverse}:{symbol:string;paymentSymbol:string;side:'buy'|'sell';setSide:(side:'buy'|'sell')=>void;amount:string;setAmount:(amount:string)=>void;inputId:string;disabled?:boolean;amountDisabled?:boolean;sideDisabled?:boolean;balanceLabel:string;output:ReactNode;outputHint:string;paymentOptions?:ReactNode;percentages?:ReactNode;onReverse:()=>void}){
 return <><div className="swap-tabs" aria-label="Trade direction">{(['buy','sell'] as const).map(direction=><Button key={direction} aria-pressed={side===direction} variant={side===direction?'default':'outline'} disabled={sideDisabled} onClick={()=>setSide(direction)}>{direction==='buy'?'Buy':'Sell'} {symbol}</Button>)}</div>{paymentOptions}
 <div className="swap-asset"><label htmlFor={inputId}>You pay</label><div className="swap-amount-row"><Input id={inputId} aria-label="Amount to pay" inputMode="decimal" value={amount} disabled={amountDisabled} onChange={event=>setAmount(event.target.value)} placeholder="0"/><span className="swap-symbol">{side==='buy'?paymentSymbol:symbol}</span></div><small>{balanceLabel}</small>{percentages}</div>
 <div className="swap-direction-row">
 <button type="button" className="swap-direction" aria-label="Reverse swap direction" disabled={sideDisabled} onClick={onReverse}><ArrowDownUp size={17}/></button>
 </div>
 <div className="swap-asset swap-receive"><span>You receive</span><div className="swap-amount-row"><output aria-live="polite">{output}</output><span className="swap-symbol">{side==='buy'?symbol:paymentSymbol}</span></div><small>{outputHint}</small></div></>;
}
