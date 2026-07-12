"use client";
import { useSyncExternalStore } from "react";
import { App } from "@/components/App";

const ACCESS_EVENT = "tierlistgen-access-change";

function subscribeToAccess(callback: () => void) {
  window.addEventListener(ACCESS_EVENT, callback);
  return () => window.removeEventListener(ACCESS_EVENT, callback);
}

function hasBrowserAccess() {
  return sessionStorage.getItem("tierlistgen-access") === "yes";
}

function hasServerAccess() {
  return false;
}

export default function Home() {
  const ok = useSyncExternalStore(subscribeToAccess, hasBrowserAccess, hasServerAccess);
  if(!ok)return <main className="gate"><div className="gate-card"><span className="kicker">PRIVATE WORKBENCH</span><h1>SETTLE THE<br/><i>DEBATE.</i></h1><p>Your lists stay on this device.</p><form onSubmit={e=>{e.preventDefault();const v=new FormData(e.currentTarget).get("code");if(v===(process.env.NEXT_PUBLIC_ACCESS_CODE||"demo")){sessionStorage.setItem("tierlistgen-access","yes");window.dispatchEvent(new Event(ACCESS_EVENT))}else alert("That code doesn’t match.")}}><input name="code" type="password" placeholder="Access code" aria-label="Access code"/><button>Enter the arena →</button></form><small>Demo code: <b>demo</b></small></div></main>;
  return <App/>;
}
