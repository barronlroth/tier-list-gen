export const TIERS=["S","A","B","C","D","F"] as const; export type Tier=typeof TIERS[number];
export type Item={id:string;name:string;image?:string;status?:"loading"|"failed"};
export type List={id:string;topic:string;items:Item[];ranking:Record<Tier,string[]>;updatedAt:number};
export const emptyRanking=():Record<Tier,string[]>=>({S:[],A:[],B:[],C:[],D:[],F:[]});
