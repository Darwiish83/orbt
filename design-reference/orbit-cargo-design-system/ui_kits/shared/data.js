try{if(!localStorage.getItem('orbit-wipe-v1')){['orbit-admin-db-v3','orbit-new-customers','orbit-customer-edits','orbit-cust-me','orbit-bus-notifs-v1','orbit-fix-3007'].forEach(k=>localStorage.removeItem(k));localStorage.setItem('orbit-wipe-v1','1');}}catch(e){}
(function(){
const banks=['Premier Bank','Salaam Somali Bank','Dahabshiil Bank','EVC Plus'];
const customers=[];
const shipments=[];
const REMAP={Guangzhou:{Air:['Istanbul','IST'],Sea:['Mersin','MER']},Dubai:{Air:['Mumbai','BOM'],Sea:['Nhava Sheva','NSA']},'Jebel Ali':{Air:['Mumbai','BOM'],Sea:['Nhava Sheva','NSA']}};
shipments.forEach(s=>{const r=REMAP[s.origin];if(r){s.origin=r[s.mode][0];s.oc=r[s.mode][1];}});
const CITY_COUNTRY={Mumbai:'India','Nhava Sheva':'India',Delhi:'India',Guangzhou:'China',Dubai:'UAE','Jebel Ali':'UAE',Istanbul:'Turkey',Mersin:'Turkey',Mogadishu:'Somalia',Hargeisa:'Somalia',Berbera:'Somalia'};
shipments.forEach(s=>{s.ocountry=s.ocountry||CITY_COUNTRY[s.origin]||'';s.dcountry=s.dcountry||CITY_COUNTRY[s.dest]||'';});
const lines=[];
lines.forEach(l=>{if(!l.status){const sh=shipments.find(x=>x.code===l.shipment);l.status=sh?sh.status:'At Origin Store';}});
const lineTotal=l=>+(l.measure*l.rate+(+l.quality||0)*(+l.measure||0)+l.brandPcs*l.brandRate+l.fatura+l.delivery+(l.other||0)-(l.discount||0)).toFixed(2);
const invoices=[].map(i=>{const l=lines.find(x=>x.shipment===i.shipment&&x.ref===i.ref);const s=shipments.find(x=>x.code===i.shipment);const total=lineTotal(l);return {...i,line:l,mode:s.mode,total,balance:+(total-i.paid).toFixed(2),status:i.paid>=total?'Paid':i.paid>0?'Partial Paid':'Unpaid',year:s.year};});
const payments=[];
const announcements=[];
const employees=[
{id:'EMP-001',name:'Mohamed Abdi Osman',phone:'+252 61 500 0001',email:'m.osman@orbitcargo.so',dept:'Management',roles:['Operation Admin','Finance Admin'],lastLogin:'Today 08:12',active:true},
{id:'EMP-004',name:'Ayaan Hussein Ali',phone:'+252 61 500 0004',email:'a.ali@orbitcargo.so',dept:'Finance',roles:['Finance Staff'],lastLogin:'Today 09:40',active:true,accAccess:true,trRole:'receive',trCountries:['Turkey','India']},
{id:'EMP-007',name:'Bashir Said Mohamud',phone:'+252 61 500 0007',email:'b.mohamud@orbitcargo.so',dept:'Operations',roles:['Operation Staff'],lastLogin:'Yesterday 17:05',active:true,trRole:'send',trCountries:['Turkey']},
{id:'EMP-009',name:'Nasra Ahmed Yusuf',phone:'+252 61 500 0009',email:'n.yusuf@orbitcargo.so',dept:'Customer Service',roles:['Customer Support'],lastLogin:'Today 07:58',active:true},
{id:'EMP-012',name:'Khalid Ibrahim Nur',phone:'+252 61 500 0012',email:'k.nur@orbitcargo.so',dept:'Documents',roles:['Document Officer'],lastLogin:'3 Oct 2026',active:false},
{id:'EMP-015',name:'Ifrah Abdullahi Hassan',phone:'+252 61 500 0015',email:'i.hassan@orbitcargo.so',dept:'Reports',roles:['Report Manager'],lastLogin:'Today 10:21',active:true}];
const documents=[];
const monthly=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m=>[m,0,0,0]).map(([m,air,sea,rev])=>({m,air,sea,rev:rev*1000}));
let added=[];try{added=JSON.parse(localStorage.getItem('orbit-new-customers')||'[]');}catch(e){}added=added.filter(c=>!['abdirahman@hassantrading.so','t@x.so'].includes(String(c.email||'').toLowerCase()));
customers.unshift(...added.slice().reverse());
let edits={};try{edits=JSON.parse(localStorage.getItem('orbit-customer-edits')||'{}');}catch(e){}
customers.forEach(c=>{if(edits[c.ref]){const {ref,...rest}=edits[c.ref];Object.assign(c,rest);}});
added.forEach(c=>announcements.unshift({id:'new-'+c.ref,type:'Customer',title:'Welcome to Orbit — your Customer Reference',message:'Your account has been created. Your Customer Reference is '+c.ref+'. Use it to log in and as your payment reference.',origin:'',dest:'',lastDay:'',flightDate:'',status:'Sent'}));
if(window.ORBIT_CLEAN!==false){[customers,shipments,lines,invoices,payments,announcements,documents].forEach(a=>a.length=0);customers.push(...added.slice().reverse());monthly.forEach(m=>Object.keys(m).forEach(x=>{if(typeof m[x]==='number')m[x]=0;}));}
try{if(window.ORBIT_CLEAN!==false){const A=JSON.parse(localStorage.getItem('orbit-admin-db-v3')||'null');if(A){const set=(arr,src)=>{if(Array.isArray(src)){arr.length=0;arr.push(...src);}};if(Array.isArray(A.customers)){const have=new Set(A.customers.map(c=>c.ref));const extra=customers.filter(c=>!have.has(c.ref));customers.length=0;customers.push(...A.customers,...extra);}set(shipments,A.shipments);set(lines,A.lines);set(invoices,A.invoices);set(payments,A.payments);set(documents,A.documents);set(announcements,A.announcements);}}}catch(e){}
window.nextCustRef=list=>{const used=new Set();(list||[]).forEach(c=>{const m=/^OR-(\d+)$/.exec(String(c.ref||''));if(m)used.add(+m[1]);});try{((JSON.parse(localStorage.getItem('orbit-admin-db-v3')||'null')||{}).customers||[]).forEach(c=>{const m=/^OR-(\d+)$/.exec(String(c.ref||''));if(m)used.add(+m[1]);});}catch(e){}try{const se=new Set();JSON.parse(localStorage.getItem('orbit-new-customers')||'[]').forEach(c=>{const e=String(c.email||'').toLowerCase();if(e&&se.has(e))return;se.add(e);const m=/^OR-(\d+)$/.exec(String(c.ref||''));if(m)used.add(+m[1]);});}catch(e){}let n=3000;while(used.has(n))n++;return 'OR-'+n;};
window.ORBIT_DATA={newCustomers:added,banks,customers,shipments,lines,lineTotal,invoices,payments,announcements,employees,documents,monthly,me:(()=>{try{const m=localStorage.getItem('orbit-cust-me');if(m&&customers.some(c=>c.ref===m))return m;}catch(e){}return '';})(),
 roles:['Operation Staff','Finance Staff','Operation Admin','Finance Admin','Customer Support','Document Officer','Report Manager'],
 departments:['Management','Operations','Finance','Customer Service','Documents','Reports'],
 statuses:['At Origin Store','Departed','In Transit','Arrived']};
})();

window.ORBIT_RULES={
volOf:(db,ref,year)=>{const S=new Map((db.shipments||[]).filter(x=>!year||x.year===year).map(x=>[x.code,x.mode]));let kg=0,cbm=0;(db.lines||[]).forEach(l=>{if(l.ref!==ref||!S.has(l.shipment))return;if(S.get(l.shipment)==='Air')kg+=+l.measure||0;else cbm+=+l.measure||0;});return {kg:+kg.toFixed(1),cbm:+cbm.toFixed(2)};},
levelOf:(db,ref,year)=>{const v=window.ORBIT_RULES.volOf(db,ref,year);const a=v.kg>=1000?4:v.kg>=300?3:v.kg>=100?2:1,b=v.cbm>=10?4:v.cbm>=4?3:v.cbm>=1?2:1;return ['D','C','B','A'][Math.max(a,b)-1];},
statusOf:(db,ref,year)=>db.lines.some(l=>l.ref===ref&&(db.shipments.find(x=>x.code===l.shipment)||{}).year===year)?'Active':'Inactive',
serviceOf:(db,ref)=>{const m=db.lines.filter(l=>l.ref===ref).map(l=>(db.shipments.find(x=>x.code===l.shipment)||{}).mode).filter(Boolean);if(!m.length)return '—';const a=m.filter(x=>x==='Air').length,s=m.length-a;return a&&s?(a>=s?'Mostly Air':'Mostly Sea'):a?'Air':'Sea';},
LEVEL_NAME:{A:'A · PRO',B:'B · VIP',C:'C · STANDARD',D:'D · BASIC'}};

window.ORBIT_RULES.ISO={china:'cn',uae:'ae','united arab emirates':'ae',turkey:'tr','türkiye':'tr',somalia:'so',kenya:'ke',ethiopia:'et',djibouti:'dj',india:'in','saudi arabia':'sa',oman:'om',egypt:'eg',qatar:'qa',pakistan:'pk',malaysia:'my',indonesia:'id',thailand:'th',vietnam:'vn',japan:'jp','south korea':'kr',usa:'us','united states':'us',uk:'gb','united kingdom':'gb',germany:'de',italy:'it',france:'fr',netherlands:'nl',belgium:'be',spain:'es',uganda:'ug',tanzania:'tz',yemen:'ye',sudan:'sd'};
(function(){const R=window.ORBIT_RULES,L=[];try{const dn=new Intl.DisplayNames(['en'],{type:'region'});const A='ABCDEFGHIJKLMNOPQRSTUVWXYZ';for(const x of A)for(const y of A){const c=x+y;let n;try{n=dn.of(c);}catch(e){continue;}if(n&&n!==c&&!/Unknown|Region/.test(n)){L.push([n,c.toLowerCase()]);if(!R.ISO[n.toLowerCase()])R.ISO[n.toLowerCase()]=c.toLowerCase();}}}catch(e){}
Object.assign(R.ISO,{chine:'cn',shiinaha:'cn',shiina:'cn',hindiya:'in',hindia:'in',turkiga:'tr',turki:'tr',imaaraadka:'ae',emirates:'ae',dubai:'ae',kiinya:'ke',itoobiya:'et',jabuuti:'dj',masar:'eg',soomaaliya:'so',suudaan:'sd',yemen:'ye',yaman:'ye',pakistan:'pk',bangladesh:'bd',thailand:'th',vietnam:'vn',indonesia:'id',malaysia:'my',usa:'us',america:'us',uk:'gb',england:'gb'});
R.COUNTRIES=L.sort((a,b)=>a[0].localeCompare(b[0]));
R.canonCountry=c=>{const k=R.ISO[(c||'').trim().toLowerCase()];if(!k)return '';const f=L.find(x=>x[1]===k);return f?f[0].replace('Türkiye','Turkey').replace('United Arab Emirates','UAE'):c;};
R.flagUrl=c=>{const k=R.ISO[(c||'').trim().toLowerCase()];return k?'https://flagcdn.com/w40/'+k+'.png':'';};})();

window.scode=c=>String(c==null?'':c).split('@')[0];
window.nextShipCode=(ships,mode,country,year)=>{const p=mode==='Air'?'W-':'C-';const n=ships.filter(s=>s.mode===mode&&s.year===year&&(s.ocountry||'')===(country||'')).map(s=>parseInt(window.scode(s.code).slice(2))||0);return p+((n.length?Math.max(...n):0)+1);};
window.uniqShipCode=(ships,code,country,year,self)=>{const base=window.scode(code);if(!ships.some(s=>s.code===base&&s.code!==self))return base;const iso=((window.ORBIT_RULES.ISO||{})[String(country||'').toLowerCase()]||String(country||'X').slice(0,2)).toUpperCase();return base+'@'+iso+year;};
window.ORBIT_DATA.employees.forEach((e,i)=>{if(!e.countries)e.countries=e.dept==='Management'?['All']:[['Turkey'],['India'],['Turkey','India']][i%3];});
window.ORBIT_DATA.originCountries=['Turkey','India'];
(function(){const D=window.ORBIT_DATA;if(D.__renumbered)return;D.__renumbered=true;const order=D.originCountries||[];const map={};const taken=new Set();
const groups={};D.shipments.forEach(s=>{const k=s.year+'|'+s.mode+'|'+(s.ocountry||'');(groups[k]=groups[k]||[]).push(s);});
Object.keys(groups).sort((a,b)=>order.indexOf(a.split('|')[2])-order.indexOf(b.split('|')[2])).forEach(k=>{const [y,m,c]=k.split('|');const iso=((window.ORBIT_RULES.ISO||{})[c.toLowerCase()]||c.slice(0,2)).toUpperCase();groups[k].sort((a,b)=>a.date<b.date?-1:1).forEach((s,i)=>{let code=(m==='Air'?'W-':'C-')+(i+1);if(taken.has(code))code=code+'@'+iso+y;taken.add(code);map[s.code]=code;});});
const fix=x=>x&&map[x]?map[x]:x;
D.shipments.forEach(s=>{s.code=fix(s.code);});
D.lines.forEach(l=>{l.shipment=fix(l.shipment);});
D.invoices.forEach(i=>{i.shipment=fix(i.shipment);});
(D.payments||[]).forEach(p=>{if(p.shipment)p.shipment=fix(p.shipment);});
(D.documents||[]).forEach(o=>{if(o.shipment)o.shipment=fix(o.shipment);});
D.__shipCodeMap=map;})();

window.ORBIT_MIX={nums:(L,code)=>[...new Set((L||[]).filter(l=>!code||l.shipment===code).flatMap(l=>l.mix||[]))].sort((a,b)=>a-b),pkgs:(L,code)=>{const R=(L||[]).filter(l=>l.shipment===code);return R.reduce((a,l)=>a+(+l.packages||0),0)+window.ORBIT_MIX.nums(R,code).length;},label:(l,t)=>{const p=+l.packages||0,m=(l.mix||[]).reduce((s,n)=>{const P=((l.mixParts||{})[n]||[]).filter(x=>x!==''&&x!=null);return s+Math.max(1,P.length);},0),T=t||(x=>x);return m?(p?p+' '+T('box')+', ':'')+m+' '+T('mix'):p+' '+T('box');}};
window.fixMixLine=l=>{const M=l.mix||[];if(!M.length&&!l.mixKg&&!l.mixParts)return l.boxKg!==undefined?{...l,measure:+(+l.boxKg||0).toFixed(2)}:l;const oldMk=Object.values(l.mixKg||{}).reduce((a,x)=>a+(+x||0),0);const box=l.boxKg!==undefined?+l.boxKg||0:+((+l.measure||0)-(M.length?0:oldMk)).toFixed(2);const K={},P={};M.forEach(n=>{const pp=((l.mixParts||{})[n]||[]).filter(x=>x!==''&&x!=null);if(pp.length){P[n]=pp;K[n]=+pp.reduce((a,x)=>a+(+x||0),0).toFixed(2);}else K[n]=+((l.mixKg||{})[n])||0;});const mk=Object.values(K).reduce((a,x)=>a+x,0);return {...l,boxKg:box,mixKg:K,mixParts:P,measure:+(box+mk).toFixed(2)};};