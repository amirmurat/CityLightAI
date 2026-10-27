import {Buffer} from 'buffer';
import {Connection,PublicKey,SystemProgram,Transaction,TransactionInstruction} from '@solana/web3.js';
import {bytesHash} from './browser-analysis';
import {evidenceHash} from './evidence';
import type {Run,Chain} from './traffic';
export const PROGRAM='AbgBg2HV8yVGUmtuZKUpifxitbhWwQ1qgrH4m158LSUx';
export const DEMO_AUTHORITY='dwimA2yrAdyXuJJb2nFZBshTXvgXBRKchQADXaBYW2v';
export type Wallet={publicKey?:PublicKey;connect:()=>Promise<unknown>;signTransaction:(tx:Transaction)=>Promise<Transaction>};
export function getWallet():Wallet{const injected=window as unknown as {phantom?:{solana:Wallet};solana?:Wallet;solflare?:Wallet};const wallet=injected.phantom?.solana??injected.solana??injected.solflare;if(!wallet)throw Error('Install Phantom or Solflare in this browser, switch it to Devnet, then connect.');return wallet;}
const hash=async(value:string|Uint8Array)=>Buffer.from(await bytesHash(typeof value==='string'?new TextEncoder().encode(value):Uint8Array.from(value)),'hex');
const disc=async(type:string,name:string)=>(await hash(`${type}:${name}`)).subarray(0,8);
export const u64=(value:number)=>{const bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(BigInt(value));return bytes;};
const id=new PublicKey(PROGRAM);
export const registryAddress=(authority:PublicKey,runId:string)=>PublicKey.findProgramAddressSync([Buffer.from('run'),authority.toBuffer(),Buffer.from(runId,'hex')],id)[0];
export const receiptAddress=(registry:PublicKey,sequence:number)=>PublicKey.findProgramAddressSync([Buffer.from('receipt'),registry.toBuffer(),u64(sequence)],id)[0];
export function connection(url:string){const parsed=new URL(url);if(parsed.protocol!=='https:'&&parsed.hostname!=='127.0.0.1'&&parsed.hostname!=='localhost')throw Error('RPC must use HTTPS');return new Connection(url,{commitment:'finalized',disableRetryOnRateLimit:true});}
async function devnet(c:Connection){if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('RPC is not Solana Devnet. No transaction will be requested.');}
async function read(c:Connection,address:PublicKey,name:string){const account=await c.getAccountInfo(address,'finalized');if(!account||!account.owner.equals(id)||!account.data.subarray(0,8).equals(await disc('account',name)))throw Error('Missing or invalid program account');return account.data;}
function checkRegistry(state:Buffer,run:Run,authority:PublicKey,intersection:Buffer){if(state.length!==192||!new PublicKey(state.subarray(8,40)).equals(authority)||!new PublicKey(state.subarray(40,72)).equals(authority)||state.subarray(72,88).toString('hex')!==run.metadata.run_id||!state.subarray(88,120).equals(intersection)||state.subarray(120,152).toString('hex')!==run.metadata.policy_hash)throw Error('Run registry does not match publisher, intersection or policy');}
export async function verifyOnChain(run:Run,chain:Chain,rpc:string){
 if(chain.run_id!==run.metadata.run_id||chain.program_id!==PROGRAM||!chain.authority)throw Error('Choose a published matching run');const c=connection(rpc);await devnet(c);const authority=new PublicKey(chain.authority),registry=registryAddress(authority,run.metadata.run_id);
 if(chain.registry!==registry.toBase58())throw Error('Registry address mismatch');const state=await read(c,registry,'RunRegistry');checkRegistry(state,run,authority,await hash(run.metadata.intersection));
 if(Number(state.readBigUInt64LE(152))!==run.evidence.length)throw Error('Publication incomplete');let previous=Buffer.alloc(32);const receipts:Chain['receipts']=[];
 for(let sequence=0;sequence<run.evidence.length;sequence++){const item=run.evidence[sequence];if(item.bundle.sequence!==sequence||await evidenceHash(item.bundle)!==item.hash)throw Error('Evidence hash or sequence mismatch');const address=receiptAddress(registry,sequence),data=await read(c,address,'DecisionReceipt');const commitment=await hash(Buffer.concat([registry.toBuffer(),u64(sequence),Buffer.from(item.hash,'hex'),previous]));
  if(data.length!==184||!new PublicKey(data.subarray(8,40)).equals(registry)||!new PublicKey(data.subarray(40,72)).equals(authority)||Number(data.readBigUInt64LE(72))!==sequence||data.subarray(80,112).toString('hex')!==item.hash||!data.subarray(112,144).equals(previous)||!data.subarray(144,176).equals(commitment))throw Error('On-chain evidence or commitment mismatch');
  previous=commitment;receipts.push({sequence,address:address.toBase58(),hash:item.hash,status:'finalized',signature:chain.receipts.find(r=>r.sequence===sequence)?.signature??''});
 }
 if(!previous.equals(state.subarray(160,192)))throw Error('Registry head mismatch');
 return {...chain,status:'finalized',receipts,verification:{valid:true,tampered_rejected:false,verified_at:new Date().toISOString(),scope:chain.authority===DEMO_AUTHORITY?'trusted-demo-operator':'publisher-attested'}} satisfies Chain;
}
export async function publishRun(run:Run,rpc:string,progress:(chain:Chain)=>void):Promise<Chain>{
 const wallet=getWallet();if(!wallet.publicKey)throw Error('Connect your wallet first');const authority=wallet.publicKey,c=connection(rpc);await devnet(c);
 const deployed=await c.getAccountInfo(id);if(!deployed?.executable)throw Error('Audit program is unavailable on this RPC');const registry=registryAddress(authority,run.metadata.run_id);
 const chain:Chain={run_id:run.metadata.run_id,status:'publishing',program_id:PROGRAM,authority:authority.toBase58(),registry:registry.toBase58(),receipts:[]};progress({...chain});
 async function send(data:Buffer,keys:{pubkey:PublicKey;isSigner:boolean;isWritable:boolean}[]){const latest=await c.getLatestBlockhash('confirmed');const tx=new Transaction({...latest,feePayer:authority}).add(new TransactionInstruction({programId:id,data,keys}));const signed=await wallet.signTransaction(tx);const signature=await c.sendRawTransaction(signed.serialize(),{preflightCommitment:'confirmed',maxRetries:3});const result=await c.confirmTransaction({...latest,signature},'finalized');if(result.value.err)throw Error('Devnet transaction failed: '+JSON.stringify(result.value.err));return signature;}
 const intersection=await hash(run.metadata.intersection);
 if(!await c.getAccountInfo(registry)){await send(Buffer.concat([await disc('global','register_run'),Buffer.from(run.metadata.run_id,'hex'),intersection,Buffer.from(run.metadata.policy_hash,'hex'),authority.toBuffer()]),[{pubkey:authority,isSigner:true,isWritable:true},{pubkey:registry,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}]);}
 for(let sequence=0;sequence<run.evidence.length;sequence++){
  const item=run.evidence[sequence];if(item.bundle.sequence!==sequence||await evidenceHash(item.bundle)!==item.hash)throw Error('Evidence changed; refusing publication');const state=await read(c,registry,'RunRegistry');checkRegistry(state,run,authority,intersection);const address=receiptAddress(registry,sequence);let signature='';
  const existing=await c.getAccountInfo(address);if(existing){if(!existing.owner.equals(id)||existing.data.length!==184||existing.data.subarray(80,112).toString('hex')!==item.hash)throw Error('Existing receipt differs');}
  else{if(Number(state.readBigUInt64LE(152))!==sequence)throw Error('Unexpected sequence: verify the existing run');signature=await send(Buffer.concat([await disc('global','record_decision'),u64(sequence),Buffer.from(item.hash,'hex'),state.subarray(160,192)]),[{pubkey:authority,isSigner:true,isWritable:true},{pubkey:registry,isSigner:false,isWritable:true},{pubkey:address,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}]);}
  chain.receipts.push({sequence,address:address.toBase58(),signature,hash:item.hash,status:'finalized'});progress({...chain,receipts:[...chain.receipts]});
 }
 return verifyOnChain(run,chain,rpc);
}
