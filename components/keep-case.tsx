/** Brand book: "grainpad" and the wXMR ticker keep their case, also inside uppercase labels (.gx-word). */
export function KeepCase({children}:{children:string}){
 return <>{children.split(/(grainpad|wXMR)/).map((part,i)=>i%2?<span key={i} className="gx-word">{part}</span>:part)}</>;
}
