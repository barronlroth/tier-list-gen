"use client";
import { useEffect, useState } from "react";
import { App } from "@/components/App";

export default function Home() {
  const [ok,setOk]=useState(false); const [ready,setReady]=useState(false);
  // The gate state comes from browser-only session storage after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{setOk(sessionStorage.getItem("tierlistgen-access")==="yes");setReady(true)},[]);
  if(!ready)return null;
  if(!ok)return <main className="gate"><div className="gate-card"><span className="kicker">PRIVATE WORKBENCH</span><h1>SETTLE THE<br/><i>DEBATE.</i></h1><p>Your lists stay on this device.</p><form onSubmit={e=>{e.preventDefault();const v=new FormData(e.currentTarget).get("code");if(v===(process.env.NEXT_PUBLIC_ACCESS_CODE||"demo")){sessionStorage.setItem("tierlistgen-access","yes");setOk(true)}else alert("That code doesn’t match.")}}><input name="code" type="password" placeholder="Access code" aria-label="Access code"/><button>Enter the arena →</button></form><small>Demo code: <b>demo</b></small></div></main>;
  return <App/>;
}
