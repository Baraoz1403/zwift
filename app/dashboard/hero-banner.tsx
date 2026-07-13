"use client";
import { useState, useEffect, useRef } from "react";
const B=[{a:"#00E5FF",bg:"linear-gradient(135deg,#0a0e1a,#0d1f3c)",t:"POWERED BY AI",h:["Your Rides.","Your Data.","Your Coach."],s:"Real-time training plans from your Zwift performance \u2014 not templates."},{a:"#00FF9C",bg:"linear-gradient(135deg,#050d0a,#0a1f16)",t:"STRUCTURED TRAINING",h:["Sweet Spot.","Threshold.","VO2max."],s:"Progressive 8-week cycles. Every session has a purpose, a target, and a reason why."},{a:"#FF6B35",bg:"linear-gradient(135deg,#1a0a05,#2d1200)",t:"ZERO MANUAL STEPS",h:["Generate.","Sync.","Ride."],s:"Plans push automatically to Zwift every Sunday via Intervals.icu. Just show up."}];
export default function HeroBanner(){
const[i,si]=useState(0);const[p,sp]=useState(0);const tr=useRef<ReturnType<typeof setInterval>|null>(null);const b=B[i];
useEffect(()=>{
if(tr.current!=null)clearInterval(tr.current);sp(0);
const s=Date.now();
tr.current=setInterval(()=>{
const pct=Math.min(((Date.now()-s)/6000)*100,100);sp(pct);
if(pct>=100){si((x:number)=>(x+1)%3);if(tr.current!=null)clearInterval(tr.current);}
},50);
return()=>{if(tr.current!=null)clearInterval(tr.current);};
},[i]);
return(
<div style={{background:b.bg,borderRadius:16,padding:"40px 36px 32px",marginBottom:40,position:"relative",overflow:"hidden",border:"1px solid "+b.a+"20",boxShadow:"0 0 50px "+b.a+"12",fontFamily:"system-ui,sans-serif"}}>
<div style={{position:"absolute",inset:0,opacity:0.035,backgroundImage:"linear-gradient("+b.a+" 1px,transparent 1px),linear-gradient(90deg,"+b.a+" 1px,transparent 1px)",backgroundSize:"36px 36px"}}/>
<div style={{position:"absolute",top:-80,right:"20%",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,"+b.a+"12,transparent 70%)",pointerEvents:"none"}}/>
<div style={{position:"relative",zIndex:1}}>
<div style={{display:"inline-flex",alignItems:"center",gap:8,background:b.a+"15",border:"1px solid "+b.a+"35",borderRadius:20,padding:"4px 14px",marginBottom:20}}>
<div style={{width:6,height:6,borderRadius:"50%",background:b.a,boxShadow:"0 0 8px "+b.a}}/>
<span style={{fontSize:10,fontWeight:700,letterSpacing:"2px",color:b.a}}>{b.t}</span>
</div>
{b.h.map((l:string,j:number)=>(<div key={j} style={{fontSize:38,fontWeight:800,lineHeight:1.1,color:j===b.h.length-1?b.a:"white",textShadow:j===b.h.length-1?"0 0 24px "+b.a+"55":"none"}}>{l}</div>))}
<p style={{fontSize:15,color:"#94a3b8",lineHeight:1.7,margin:"16px 0 28px",maxWidth:480}}>{b.s}</p>
<div style={{display:"flex",gap:10}}>
{B.map((_:{a:string},j:number)=>(<button key={j} onClick={()=>si(j)} style={{border:"none",cursor:"pointer",padding:0,background:"transparent"}}>
<div style={{position:"relative",width:j===i?36:7,height:7,borderRadius:4,background:j===i?b.a+"35":"#334155",transition:"width .3s",overflow:"hidden"}}>
{j===i&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:p+"%",background:b.a,borderRadius:4}}/>}
</div>
</button>))}
</div>
</div>
</div>
);
}
