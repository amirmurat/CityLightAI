import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {Keypair,PublicKey,Connection,SystemProgram,Transaction,TransactionInstruction,sendAndConfirmTransaction} from '@solana/web3.js';

export const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest();
export function canonical(x:any):string{
 if(x===null||typeof x==='string'||typeof x==='boolean')return JSON.stringify(x);
 if(typeof x==='number'){if(!Number.isSafeInteger(x))throw Error('Integer units required');return String(x);}
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(typeof x==='object'){const keys=Object.keys(x).sort();if(keys.some(k=>/[^\x00-\x7f]/.test(k)))throw Error('ASCII keys required');return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';}
 throw Error('Unsupported evidence type');
}
export const u64=(n:number|bigint)=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;};
export const discriminator=(type:string,name:string)=>sha(`${type}:${name}`).subarray(0,8);
export const commitment=(registry:PublicKey,sequence:number,evidence:Buffer,previous:Buffer)=>sha(Buffer.concat([registry.toBuffer(),u64(sequence),evidence,previous]));
const programFile='data/program.json';
const rpc=process.env.SOLANA_RPC_URL??'https://api.devnet.solana.com';
const connection=new Connection(rpc,'finalized');
async function requireDevnet(){if(await connection.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('Only Solana Devnet is allowed');}
const runs='data/runs';
const saveChain=(value:any)=>{const path=`${runs}/chain.json`;writeFileSync(path+'.tmp',JSON.stringify(value,null,2));renameSync(path+'.tmp',path);};
const program=()=>new PublicKey(JSON.parse(readFileSync(programFile,'utf8')).program_id);
const key=()=>{const path=process.env.CITYLIGHT_KEYPAIR??'.secrets/publisher.json';if(!existsSync(path))throw Error(`Missing ${path}. Run 'chain wallet' or export the development-only keypair securely.`);return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path,'utf8'))));};
const registryAddress=(id:PublicKey,authority:PublicKey,runId:string)=>PublicKey.findProgramAddressSync([Buffer.from('run'),authority.toBuffer(),Buffer.from(runId,'hex')],id)[0];
const receiptAddress=(id:PublicKey,registry:PublicKey,sequence:number)=>PublicKey.findProgramAddressSync([Buffer.from('receipt'),registry.toBuffer(),u64(sequence)],id)[0];
async function readAccount(address:PublicKey,disc:string,id:PublicKey){
 const account=await connection.getAccountInfo(address,'finalized');if(!account)throw Error(`Account not found: ${address}`);
 if(!account.owner.equals(id)||!account.data.subarray(0,8).equals(discriminator('account',disc)))throw Error('Invalid account owner/discriminator');
 return account.data;
}
async function send(id:PublicKey,data:Buffer,keys:any[],payer:Keypair){
 const tx=new Transaction().add(new TransactionInstruction({programId:id,data,keys}));
 return sendAndConfirmTransaction(connection,tx,[payer],{commitment:'finalized',preflightCommitment:'confirmed',maxRetries:5});
}
export async function verifyBundle(bundle:any,hash:string){return sha(canonical(bundle)).toString('hex')===hash;}
async function verify(){
 const local=JSON.parse(readFileSync(`${runs}/latest.json`,'utf8'));
 const chain=JSON.parse(readFileSync(`${runs}/chain.json`,'utf8'));
 if(chain.run_id!==local.metadata.run_id)throw Error('Displayed run does not match published run');
 const id=program();if(chain.program_id!==id.toBase58())throw Error('Unexpected program ID');
 const registry=new PublicKey(chain.registry);const authority=new PublicKey(chain.authority);
 const config=JSON.parse(readFileSync(programFile,'utf8'));
 if(authority.toBase58()!==config.operator_authority)throw Error('Untrusted operator authority');
 if(!registry.equals(registryAddress(id,authority,local.metadata.run_id)))throw Error('Registry PDA mismatch');
 const state=await readAccount(registry,'RunRegistry',id);
 if(state.length!==192)throw Error('Registry length mismatch');
 if(!new PublicKey(state.subarray(8,40)).equals(authority))throw Error('Authority mismatch');
 const publisher=new PublicKey(state.subarray(40,72));
 if(state.subarray(72,88).toString('hex')!==local.metadata.run_id||state.subarray(88,120).toString('hex')!==sha(local.metadata.intersection).toString('hex')||state.subarray(120,152).toString('hex')!==local.metadata.policy_hash)throw Error('Approved run/policy mismatch');
 if(Number(state.readBigUInt64LE(152))!==local.evidence.length)throw Error('Incomplete receipt sequence');
 let previous=Buffer.alloc(32);
 for(const item of local.evidence){
  const seq=item.bundle.sequence;const address=receiptAddress(id,registry,seq);const data=await readAccount(address,'DecisionReceipt',id);
  if(data.length!==184||!new PublicKey(data.subarray(8,40)).equals(registry)||!new PublicKey(data.subarray(40,72)).equals(publisher)||Number(data.readBigUInt64LE(72))!==seq)throw Error('Receipt metadata mismatch');
  const hash=sha(canonical(item.bundle));
  if(!hash.equals(data.subarray(80,112))||!previous.equals(data.subarray(112,144)))throw Error('Evidence or chain mismatch');
  const expected=commitment(registry,seq,hash,previous);if(!expected.equals(data.subarray(144,176)))throw Error('Commitment mismatch');previous=expected;
 }
 if(!previous.equals(state.subarray(160,192)))throw Error('Registry head mismatch');
 const changed=structuredClone(local.evidence[0].bundle);changed.observation.approaches.A.queued++;
 const tampered=!(await verifyBundle(changed,local.evidence[0].hash));
 chain.verification={...chain.verification,valid:true,tampered_rejected:tampered,verified_at:new Date().toISOString()};
 saveChain(chain);console.log(JSON.stringify(chain.verification));
}
async function discover(){
 const local=JSON.parse(readFileSync(`${runs}/latest.json`,'utf8'));
 const config=JSON.parse(readFileSync(programFile,'utf8'));
 const id=program();const authority=new PublicKey(config.operator_authority);
 const registry=registryAddress(id,authority,local.metadata.run_id);
 const state=await readAccount(registry,'RunRegistry',id);
 const receipts=[];
 for(let seq=0;seq<Number(state.readBigUInt64LE(152));seq++){
  const address=receiptAddress(id,registry,seq);const data=await readAccount(address,'DecisionReceipt',id);
  const signatures=await connection.getSignaturesForAddress(address,{limit:1},'finalized');
  receipts.push({sequence:seq,address:address.toBase58(),signature:signatures[0]?.signature??'',hash:data.subarray(80,112).toString('hex'),status:'finalized'});
 }
 const chain={status:'finalized',run_id:local.metadata.run_id,program_id:id.toBase58(),authority:authority.toBase58(),registry:registry.toBase58(),receipts};
 saveChain(chain);await verify();
}
async function publish(){
 await requireDevnet();
 const local=JSON.parse(readFileSync(`${runs}/latest.json`,'utf8'));const payer=key();const id=program();
 if(payer.publicKey.toBase58()!==JSON.parse(readFileSync(programFile,'utf8')).operator_authority)throw Error('Keypair does not match configured operator authority');
 const programState=await connection.getAccountInfo(id);if(!programState?.executable)throw Error('Program is not deployed');
 const registry=registryAddress(id,payer.publicKey,local.metadata.run_id);
 let chain:any=existsSync(`${runs}/chain.json`)?JSON.parse(readFileSync(`${runs}/chain.json`,'utf8')):{};
 if(chain.run_id!==local.metadata.run_id)chain={status:'publishing',run_id:local.metadata.run_id,program_id:id.toBase58(),authority:payer.publicKey.toBase58(),registry:registry.toBase58(),receipts:[]};
 const save=()=>saveChain(chain);save();
 if(!await connection.getAccountInfo(registry)){
  const data=Buffer.concat([discriminator('global','register_run'),Buffer.from(local.metadata.run_id,'hex'),sha(local.metadata.intersection),Buffer.from(local.metadata.policy_hash,'hex'),payer.publicKey.toBuffer()]);
  chain.register_signature=await send(id,data,[{pubkey:payer.publicKey,isSigner:true,isWritable:true},{pubkey:registry,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],payer);save();
 }
 for(const item of local.evidence){
  const seq=item.bundle.sequence;const address=receiptAddress(id,registry,seq);const hash=sha(canonical(item.bundle));
  if(hash.toString('hex')!==item.hash)throw Error('Local evidence hash mismatch');
  const existing=await connection.getAccountInfo(address);
  if(existing){
   if(!existing.owner.equals(id)||existing.data.subarray(80,112).toString('hex')!==item.hash)throw Error('Existing receipt differs');
   if(!chain.receipts.some((r:any)=>r.sequence===seq)){
    const signatures=await connection.getSignaturesForAddress(address,{limit:1},'finalized');
    chain.receipts.push({sequence:seq,address:address.toBase58(),signature:signatures[0]?.signature??'',hash:item.hash,status:'finalized'});save();
   }
   continue;
  }
  const state=await readAccount(registry,'RunRegistry',id);const next=Number(state.readBigUInt64LE(152));if(next!==seq)throw Error('Sequence mismatch on retry');
  const previous=state.subarray(160,192);
  const signature=await send(id,Buffer.concat([discriminator('global','record_decision'),u64(seq),hash,previous]),[{pubkey:payer.publicKey,isSigner:true,isWritable:true},{pubkey:registry,isSigner:false,isWritable:true},{pubkey:address,isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],payer);
  chain.receipts.push({sequence:seq,address:address.toBase58(),signature,hash:item.hash,status:'finalized'});save();console.log(`Finalized receipt ${seq}: ${signature}`);
 }
 chain.status='finalized';save();await verify();
}
async function negative(){
 await requireDevnet();
 const local=JSON.parse(readFileSync(`${runs}/latest.json`,'utf8'));const chain=JSON.parse(readFileSync(`${runs}/chain.json`,'utf8'));const id=program();const registry=new PublicKey(chain.registry);const state=await readAccount(registry,'RunRegistry',id);const seq=Number(state.readBigUInt64LE(152));const attacker=Keypair.generate();
 const tx=new Transaction().add(new TransactionInstruction({programId:id,keys:[{pubkey:attacker.publicKey,isSigner:true,isWritable:true},{pubkey:registry,isSigner:false,isWritable:true},{pubkey:receiptAddress(id,registry,seq),isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],data:Buffer.concat([discriminator('global','record_decision'),u64(seq),Buffer.from(local.evidence[0].hash,'hex'),state.subarray(160,192)])}));
 const payer=key();
 // Anchor init runs before has_one: fund the simulated payer so the test reaches authorization.
 // This transaction is ONLY simulated; no SOL is transferred.
 tx.instructions.unshift(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:attacker.publicKey,lamports:2000000}));
 tx.feePayer=payer.publicKey;tx.recentBlockhash=(await connection.getLatestBlockhash()).blockhash;tx.sign(payer,attacker);
 const simulated=await connection.simulateTransaction(tx);
 const rejected=!!simulated.value.err&&!!simulated.value.logs?.some(l=>l.includes('ConstraintHasOne'));
 if(!rejected)throw Error('Unauthorized-publisher test did not hit the expected authorization constraint: '+JSON.stringify({error:simulated.value.err,logs:simulated.value.logs}));
 async function rejectedAuthorized(sequence:number,previous:Buffer,expected:string){
  const test=new Transaction().add(new TransactionInstruction({programId:id,keys:[{pubkey:payer.publicKey,isSigner:true,isWritable:true},{pubkey:registry,isSigner:false,isWritable:true},{pubkey:receiptAddress(id,registry,sequence),isSigner:false,isWritable:true},{pubkey:SystemProgram.programId,isSigner:false,isWritable:false}],data:Buffer.concat([discriminator('global','record_decision'),u64(sequence),Buffer.from(local.evidence[0].hash,'hex'),previous])}));
  test.feePayer=payer.publicKey;test.recentBlockhash=(await connection.getLatestBlockhash()).blockhash;test.sign(payer);
  const result=await connection.simulateTransaction(test);
  if(!result.value.err||!result.value.logs?.some(l=>l.includes(expected)))throw Error(`Expected ${expected}: `+JSON.stringify(result.value));
 }
 await rejectedAuthorized(seq+1,state.subarray(160,192),'InvalidSequence');
 await rejectedAuthorized(seq,Buffer.alloc(32),'BrokenChain');
 chain.verification={...chain.verification,unauthorized_rejected:true,invalid_sequence_rejected:true,broken_chain_rejected:true};saveChain(chain);console.log('Unauthorized publisher, wrong sequence and broken chain rejected in on-chain simulations.');
}
async function main(){const cmd=process.argv[2];if(cmd==='wallet'){mkdirSync('.secrets',{recursive:true});const p='.secrets/publisher.json';if(!existsSync(p))writeFileSync(p,JSON.stringify(Array.from(Keypair.generate().secretKey)),{mode:0o600});console.log(key().publicKey.toBase58());}else if(cmd==='publish')await publish();else if(cmd==='verify')await verify();else if(cmd==='discover')await discover();else if(cmd==='negative')await negative();else if(cmd==='balance')console.log(await connection.getBalance(key().publicKey)/1e9);else throw Error('Usage: chain wallet|publish|discover|verify|negative|balance');}
if(process.argv[1]?.endsWith('chain.ts'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
