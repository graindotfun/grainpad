/* grain runtime 2.1.0: drives mori, nori, pip, rolo and peb live in the browser.
   Same source as the stickers (grain-core.js must be loaded first). Pure SVG, no dependencies.
   2.1.0 is backward compatible with 2.0: everything that worked keeps working.

   const g = GrainRuntime.create(svgGroup, {
     characterId:'mori', displayName:'mori',   // characterId is fixed; displayName is the player's name for it
     x:300, ground:420, scale:0.5,             // anchor = ground contact point, in the parent svg's units
     state:'alert',                            // NEW: initial state, 'alert' (default) or 'asleep'
     layers:{shadow:true, propsBack:true, propsFront:true, fx:true}
   });
   g.play('eat', {dir:1});      // one-shot; afterwards the grain rests in the loop that matches its state
   g.cancel();                  // NEW: cancel a light action in place (see "Cancel" below)
   g.destroy();                 // NEW: remove the instance (safe to call twice)
   g.on(e => ...);              // e.type: start | end | cancel | bite | contact | touch | takeoff | land
   requestAnimationFrame: GrainRuntime.tick(dtSeconds)

   Position ownership (so nothing moves twice):
   - The runtime owns the pose and every motion INSIDE an action. Every action ends back at its anchor.
   - The game owns the anchor (g.x, g.ground) between actions.
   - Exception: 'hop' with {dx} (same units as g.x): the runtime carries the grain through the flight and
     commits g.x += dx when the hop completes. A cancelled or destroyed hop never commits.

   Cancel:
   - Cancelable (explicit list, also in the manifest as "cancelable": true): curious, happy, pet.
   - Not cancelable: idle, sleep (resting loops, nothing to cancel), tired, wake (state transitions),
     hop, eat, push, ritual (they carry contact events, props or movement the game relies on).
   - cancel() returns true when it cancelled, false otherwise (and never throws).
   - A cancelled action emits {type:'cancel', action} and NOTHING else: no 'end' (end means "completed"),
     and no later bite/contact/touch events. The grain snaps to the resting loop of its state.

   Destroy:
   - Stops the instance, clears its listeners and empties its svg group. destroy({removeElement:true}) also
     removes the group from the DOM. Calling it again, or calling play/cancel/tick afterwards, does nothing.

   Props:
   - Props (pebble, cloth, crumb, slot) belong to an action. g.props lists the current ones in anchor-local px at
     scale 1; g.worldProps() converts them to the units of g.x / g.ground. The 'end' event carries the props'
     final state as e.props, so the game can keep an object that an action moved (see push and ritual in the manifest).
   - To draw props yourself pass layers:{propsBack:false, propsFront:false} and use g.worldProps().            */
const GrainRuntime=(()=>{ const VERSION='2.1.0'; const all=[]; let seq=0;
  const REST={alert:'idle',asleep:'sleep'};
  function create(el,opt){
    opt=opt||{}; const id=opt.characterId; if(!ACTIONS[id]) throw new Error('unknown characterId '+id);
    const state=opt.state===undefined?'alert':opt.state; if(!REST[state]) throw new Error('state must be "alert" or "asleep"');
    const g={el,characterId:id,displayName:opt.displayName||id,x:opt.x||0,ground:opt.ground||0,scale:opt.scale||0.5,
      layers:Object.assign({shadow:true,propsBack:true,propsFront:true,fx:true},opt.layers||{}),
      state,action:REST[state],at:opt.phase!==undefined?opt.phase:Math.random()*2,opts:{},loop:true,listeners:[],fired:new Set(),
      uid:'g'+(++seq)+'_',destroyed:false,props:[]};
    const emit=e=>{ if(g.destroyed) return; const ev={...e,characterId:id}; g.listeners.slice().forEach(f=>{ if(!g.destroyed) f(ev); }); };
    g._emit=emit;
    g.on=fn=>{ g.listeners.push(fn); return ()=>{ g.listeners=g.listeners.filter(f=>f!==fn); }; };
    g.setDisplayName=n=>{ g.displayName=String(n).slice(0,24); };
    g.can=a=>!g.destroyed&&!!ACTIONS[id][a]&&ACTIONS[id][a].start===g.state;
    g.cancelable=a=>!!(ACTIONS[id][a]&&ACTIONS[id][a].cancelable);
    g.duration=a=>ACTIONS[id][a].dur;
    g.play=(a,o={})=>{ if(g.destroyed) return false; const A=ACTIONS[id][a]; if(!A){ console.warn('grain: no action',a); return false; }
      if(A.start!==g.state){ console.warn(`grain: ${a} starts from "${A.start}", ${id} is "${g.state}"`); return false; }
      g.action=a; g.at=0; g.opts={...o,dx:o.dx?o.dx/g.scale:0,dxScreen:o.dx||0}; g.loop=o.loop===undefined?A.loop:!!o.loop; g.fired=new Set();
      emit({type:'start',action:a}); return true; };
    g.cancel=()=>{ if(g.destroyed) return false; const A=ACTIONS[id][g.action];
      if(g.action===REST[g.state]) return false;                                    // already resting: nothing to cancel
      if(!A.cancelable){ console.warn(`grain: ${g.action} is not cancelable`); return false; }
      const done=g.action; g.state=A.start; g.action=REST[g.state]; g.at=0; g.opts={}; g.loop=true; g.fired=new Set();
      render(g); emit({type:'cancel',action:done}); return true; };
    g.worldProps=()=>g.props.map(p=>({...p,x:g.x+p.x*g.scale,y:g.ground+p.y*g.scale,scale:p.scale*g.scale}));
    g.destroy=(o={})=>{ if(g.destroyed) return; g.destroyed=true; const i=all.indexOf(g); if(i>=0) all.splice(i,1);
      g.listeners=[]; g.fired=new Set(); g.props=[]; try{ g.el.replaceChildren(); }catch(_){ g.el.innerHTML=''; }
      if(o.removeElement&&g.el.parentNode) g.el.parentNode.removeChild(g.el); };
    all.push(g); render(g); return g; }
  const propList=P=>(P||[]).map(p=>({id:p.id,x:p.x,y:p.y,rotation:p.rotation||0,scale:p.scale===undefined?1:p.scale}));
  function propStates(characterId,action,t,o){ UID=0; const L=renderAction(characterId,action,t,o||{}); return propList(L.props); }
  function render(g){ IDP=g.uid; UID=0;
    const L=renderAction(g.characterId,g.action,g.at,g.opts); IDP=''; g.props=propList(L.props);
    const ly=g.layers; const svg=(ly.shadow?L.shadow:'')+(ly.propsBack?L.back:'')+L.character+(ly.propsFront?L.front:'')+(ly.fx?L.fx:'');
    g.el.setAttribute('transform',`translate(${g.x} ${g.ground}) scale(${g.scale})`); g.el.innerHTML=svg; }
  function tick(dt){ for(const g of all.slice()){ if(g.destroyed) continue; const A=ACTIONS[g.characterId][g.action];
      g.at+=dt;
      (A.events||[]).forEach((e,i)=>{ if(!g.destroyed&&!g.fired.has(i)&&g.at>=e.t){ g.fired.add(i); g._emit({...e,action:g.action}); } });
      if(g.destroyed) continue;
      if(g.at>=A.dur){
        if(g.loop){ g.at-=A.dur; g.fired=new Set(); }
        else { const done=g.action, endProps=propStates(g.characterId,done,A.dur,g.opts);
          if(done==='hop'&&g.opts.dxScreen) g.x+=g.opts.dxScreen;
          g.state=A.end; g.action=REST[g.state]; g.at=0; g.opts={}; g.loop=true; g.fired=new Set(); g._emit({type:'end',action:done,props:endProps}); } }
      if(!g.destroyed) render(g); } }
  return {create,tick,propStates,instances:all,version:VERSION}; })();
if(typeof module!=='undefined') module.exports=GrainRuntime;
