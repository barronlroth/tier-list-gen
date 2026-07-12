import {openDB} from "idb"; import type {List} from "./types";
const db=()=>openDB("tierlistgen",1,{upgrade(d){d.createObjectStore("lists",{keyPath:"id"})}});
export async function saveList(v:List){return (await db()).put("lists",v)} export async function getLists(){return (await db()).getAll("lists") as Promise<List[]>} export async function deleteList(id:string){return (await db()).delete("lists",id)}
