import ts from 'typescript';import {readFile,writeFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';
await mkdir('.sites-runtime/history-tests',{recursive:true});
for(const [source,name] of [['lib/rules/closers.ts','closers'],['lib/rules/calendar-rules.ts','calendar-rules'],['lib/historical-analytics.ts','historical-analytics']]){let text=await readFile(source,'utf8');text=text.replaceAll("'./rules/closers'","'./closers.mjs'").replaceAll("'./rules/calendar-rules'","'./calendar-rules.mjs'");await writeFile(`.sites-runtime/history-tests/${name}.mjs`,ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText)}
const {historicalAnalytics}=await import('../.sites-runtime/history-tests/historical-analytics.mjs');
const own='leandrobatista@metodohod.com';const event=(id,extra={})=>({canonical_id:id,calendar_id:own,created_at:'2026-03-01T02:30:00Z',starts_at:'2026-03-04T18:00:00-03:00',deleted:0,raw:JSON.stringify({id,summary:'Consultoria Lead '+id,organizer:{email:own},created:'2026-03-01T02:30:00Z',start:{dateTime:'2026-03-04T18:00:00-03:00'},attendees:[{email:'marcos@metodohod.com'},{email:'lead@example.com'}],...extra})});
const a=event('a'),copy={...a,calendar_id:'marcos@metodohod.com'};const nonstandard=event('b',{summary:'Reunião Maria'}),internal=event('c',{summary:'Daily Comercial'}),otherAuthor=event('d',{organizer:{email:'another@metodohod.com'}}),ambiguous=event('e',{attendees:[{email:'marcos@metodohod.com'},{email:'tulio@metodohod.com'},{email:'lead@example.com'}]}),cancelled={...event('f'),deleted:1},missingCreated=event('g',{created:undefined});missingCreated.created_at='';
const h=historicalAnalytics([a,copy,nonstandard,internal,otherAuthor,ambiguous,cancelled,missingCreated],[own],true,'2026-10-02');
assert.equal(h.records.length,6);assert.equal(h.records.find(r=>r.id==='a').created,'2026-02-28');assert.equal(h.records.find(r=>r.id==='a').former,true);assert.equal(h.records.find(r=>r.id==='e').credits.length,2);assert.equal(h.records.find(r=>r.id==='f').cancelled,true);assert.equal(h.coverage.excludedOtherAuthors,0);assert.equal(h.coverage.excludedInternal,1);assert.equal(h.coverage.review,0);assert.equal(h.coverage.withoutCreated,1);assert.equal(h.coverage.personalConnected,false);
const unhosted=historicalAnalytics([event('x',{organizer:{email:'another@example.com',displayName:'Leandro Batista'}})],[own],true,'2026-10-02');assert.equal(unhosted.records.length,1);
const noLead=historicalAnalytics([event('x',{summary:'Reunião Equipe',attendees:[{email:'marcos@metodohod.com'}]})],[own],true,'2026-10-02');assert.equal(noLead.records.length,0);
const aliases=historicalAnalytics([event('alias',{attendees:[{email:'graziela@metodohod.com'},{email:'former.personal@example.com'},{email:'lead@example.com'}]})],[own],true,'2026-10-02',[],[{email:'former.personal@example.com',name:'Graziela'}]);assert.equal(aliases.records[0].closer,'Graziela');assert.equal(aliases.records[0].attribution,'verified');assert.equal(aliases.records[0].formerLabel,'Antiga membra');
const supplied=historicalAnalytics([event('supplied',{organizer:{email:'historical@example.com'}})],[own],true,'2026-10-02',['historical@example.com']);assert.equal(supplied.records.length,1);assert.ok(supplied.coverage.authorAccounts.includes('historical@example.com'));
const people=historicalAnalytics([event('personal',{attendees:[{email:'nina.personal@example.com'},{email:'lead@example.com'}]}),event('corporate',{attendees:[{email:'karina@metodohod.com'},{email:'lead2@example.com'}]}),event('alvaro',{attendees:[{email:'alvaro@metodohod.com'},{email:'lead3@example.com'}]}),event('generic',{attendees:[{email:'reuniao@metodohod.com'}]})],[own],true,'2026-10-02',[],[{email:'nina.personal@example.com',name:'Karina'}]);assert.equal(people.records.filter(r=>r.closer==='Karina').length,2);assert.equal(people.records.find(r=>r.id==='alvaro').formerLabel,'Ex-Closer');assert.equal(people.records.find(r=>r.id==='generic'),undefined);assert.ok(!people.records.some(r=>r.closer==='Reunião'||r.closer==='Leandro Batista'));
console.log('Passed: owner attribution, invitation dedup, former closer, nonstandard lead meeting, internal exclusion, ambiguous attribution, preserved cancellation, São Paulo creation date and missing-data disclosure.');

const scoped=historicalAnalytics([event('one',{attendees:[{email:'tulio@metodohod.com'},{email:'former.personal@example.com'}]}),event('two')],[own],true,'2026-10-02',[],[],[],[{id:'one',name:'Lucas'}]);assert.equal(scoped.records.find(r=>r.id==='one').closer,'Luccas');assert.equal(scoped.records.find(r=>r.id==='two').closer,'Marcos');

// Owner participation replaces mandatory creator/organizer attribution (04/10/2026).
const joined=event('joined',{organizer:{email:'rafael@metodohod.com'},creator:{email:'rafael@metodohod.com'},attendees:[{email:own},{email:'luccas@metodohod.com'},{email:'lead@example.com'}]});
const joinedCopy={...joined,calendar_id:'luccas@metodohod.com'};
const personalJoined=event('personalJoined',{summary:'Conversa com cliente distinto',organizer:{email:'rafael@metodohod.com'},attendees:[{email:'leandrobatsta@gmail.com'},{email:'marcos@metodohod.com'},{email:'lead@example.com'}]});
const audit=historicalAnalytics([joined,joinedCopy,personalJoined,{...joined,canonical_id:'internal',raw:JSON.stringify({...JSON.parse(joined.raw),summary:'Daily comercial'})},{...joined,canonical_id:'noGuest',raw:JSON.stringify({...JSON.parse(joined.raw),attendees:[{email:own},{email:'luccas@metodohod.com'}]})}],[own,'leandrobatsta@gmail.com'],true,'2026-10-04');
assert.equal(audit.records.length,2);assert.equal(audit.records.find(r=>r.id==='joined').closer,'Luccas');assert.equal(audit.records.find(r=>r.id==='personalJoined').closer,'Marcos');
console.log('Participant + closer + guest, both accounts, internal exclusion and deduplication passed.');

const otherSdr=historicalAnalytics([{...joined,raw:JSON.stringify({...JSON.parse(joined.raw),summary:'Conversa com cliente'})}],[own],true,'2026-10-04',[],[],[],[],['lead@example.com']);assert.equal(otherSdr.records.length,0);assert.equal(otherSdr.coverage.excludedOtherSdr,1);
const noCloser=historicalAnalytics([event('without',{attendees:[{email:own},{email:'lead@example.com'}]})],[own],true,'2026-10-04');assert.equal(noCloser.records.length,0);assert.equal(noCloser.coverage.excludedWithoutCloser,1);

// GoHighLevel title attribution and name deduplication across different months/closers.
const first=event('first',{summary:'Consultoria Joelson Rodrigues',organizer:{email:'luigi@metodohod.com'},created:'2026-08-01T12:00:00Z',attendees:[{email:'luigi@metodohod.com'},{email:'joelson@example.com'}]});
const repeated=event('repeated',{summary:'Consultoria JOÉLSON  RODRIGUES (reagendamento)',organizer:{email:'paulohenrique@metodohod.com'},created:'2026-09-01T12:00:00Z',attendees:[{email:'paulohenrique@metodohod.com'},{email:'joelson@example.com'}]});
const another=event('another',{summary:'Consultoria Maria Silva',organizer:{email:'luigi@metodohod.com'},created:'2026-09-02T12:00:00Z',attendees:[{email:'luigi@metodohod.com'},{email:'maria@example.com'}]});
const unique=historicalAnalytics([first,{...first,calendar_id:'luigi@metodohod.com'},repeated,{...repeated,canonical_id:'again'},another],[own],true,'2026-10-04');
assert.equal(unique.records.length,2);assert.equal(unique.coverage.duplicateLeads,2);
const joelson=unique.records.find(r=>r.name==='Joelson Rodrigues');assert.equal(joelson.created,'2026-08-01');assert.deepEqual(joelson.credits.map(c=>c.name).sort(),['Luigi','Paulo Henrique']);
assert.equal(unique.records.filter(r=>r.created.startsWith('2026-09')).length,1);
assert.equal(historicalAnalytics([event('internalTitle',{summary:'Daily Consultoria',organizer:{email:'luigi@metodohod.com'}})],[own],true,'2026-10-04').records.length,0);
console.log('Title-only attribution, repeated leads across months, accent/case normalization and unique credit per closer passed.');

assert.equal(historicalAnalytics([joined],[own],true,'2026-10-04',[],[],[],[],['lead@example.com']).records.length,0);

const business=historicalAnalytics([event('vendor',{summary:'Reunião Estratégica: Metodo Hod + Octadesk'}),event('director',{summary:'Apresentação Poli - Diretoria Home office digital'}),event('project',{summary:'Reunião Evolução de projeto - Metodo HOD & Octadesk'})],[own],true,'2026-10-04');assert.equal(business.records.length,0);assert.equal(business.coverage.excludedInternal,3);
const prefixed=historicalAnalytics([event('prefix',{summary:'HOD - Giovanna Baltoe'}),event('normal',{summary:'Consultoria Giovanna Baltoe'})],[own],true,'2026-10-04');assert.equal(prefixed.records.length,1);assert.equal(prefixed.coverage.duplicateLeads,1);
console.log('Vendor/director internal meeting exclusions and HOD prefix lead deduplication passed.');

const januarySource=event('january',{summary:'Consultoria Lead janeiro',created:'2026-01-15T12:00:00Z',start:{dateTime:'2026-01-20T18:00:00-03:00'}});januarySource.created_at='2026-01-15T12:00:00Z';
const februaryMeetingCreatedInJanuary=event('february-meeting',{summary:'Consultoria Lead reagendado',created:'2026-01-31T12:00:00Z',start:{dateTime:'2026-02-02T18:00:00-03:00'}});februaryMeetingCreatedInJanuary.created_at='2026-01-31T12:00:00Z';
const period=historicalAnalytics([januarySource,februaryMeetingCreatedInJanuary],[own],true,'2026-10-04');assert.equal(period.coverage.from,'2026-02-01');assert.deepEqual(period.records.map(r=>r.id),['february-meeting']);assert.equal(period.records[0].created,'2026-01-31');assert.equal(period.records[0].date,'2026-02-02');
console.log('January-only records are excluded while meetings scheduled for February remain available in the meeting-date dimension.');
