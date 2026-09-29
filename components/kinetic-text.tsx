import type {CSSProperties} from "react";

export function KineticText({children}:{children:string}) {
  return <span className="kinetic-text" aria-label={children}>{children.split(" ").map((word,w)=><span key={w} aria-hidden="true"><span className="kinetic-word">{Array.from(word).map((letter,i)=><span className={`kinetic-glyph${letter === "." ? " is-period" : ""}`} key={i} style={{"--glyph-index":i} as CSSProperties}><span className="kinetic-ink">{letter}</span><span className="glyph-points"><i/><i/><i/><i/></span></span>)}</span>{w<children.split(" ").length-1?" ":""}</span>)}</span>;
}
