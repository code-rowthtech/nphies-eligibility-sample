import { randomUUID } from 'node:crypto';
export type Resource = { resourceType: string; id: string; [key: string]: any };
export type Input = { patientId: string; memberId: string; providerLicense: string; payerLicense: string; serviceDate: string; [key: string]: unknown };
export const EVENT_SYSTEM = 'http://nphies.sa/terminology/CodeSystem/ksa-message-events';
export function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('serviceDate must be a real YYYY-MM-DD date');
  return value;
}
export function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) throw new Error(`Invalid ${field}`);
  return value;
}
export function context(input: Input) {
  for (const key of ['patientId','memberId','providerLicense','payerLicense']) text(input[key], key);
  date(input.serviceDate);
  const make = (resourceType: string, body: object): Resource => ({resourceType,id:randomUUID(),...body});
  const patient=make('Patient',{identifier:[{system:'https://example.invalid/synthetic-patient-id',value:input.patientId}],name:[{family:'Synthetic',given:['Patient001']}],gender:'unknown'});
  const provider=make('Organization',{identifier:[{system:'http://nphies.sa/license/provider-license',value:input.providerLicense}],active:true,name:'Synthetic Provider'});
  const insurer=make('Organization',{identifier:[{system:'http://nphies.sa/license/payer-license',value:input.payerLicense}],active:true,name:'Synthetic Insurer'});
  const ref=(r:Resource)=>({reference:`urn:uuid:${r.id}`});
  const coverage=make('Coverage',{identifier:[{system:'https://example.invalid/member-id',value:input.memberId}],status:'active',subscriberId:input.memberId,beneficiary:ref(patient),relationship:{coding:[{system:'http://terminology.hl7.org/CodeSystem/subscriber-relationship',code:'self'}]},payor:[ref(insurer)]});
  return {make,ref,patient,provider,insurer,coverage};
}
export function message(input: Input, focus: Resource, supporting: Resource[], timestamp: string) {
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid message timestamp');
  const event=focus.resourceType==='Claim'?'claim-request':'eligibility-request';
  const header: Resource={resourceType:'MessageHeader',id:randomUUID(),eventCoding:{system:EVENT_SYSTEM,code:event},source:{endpoint:'https://example.invalid/synthetic-provider'},
    sender:{type:'Organization',identifier:{system:'http://nphies.sa/license/provider-license',value:input.providerLicense}},
    destination:[{endpoint:`http://nphies.sa/license/payer-license/${input.payerLicense}`,receiver:{type:'Organization',identifier:{system:'http://nphies.sa/license/payer-license',value:input.payerLicense}}}],focus:[{reference:`urn:uuid:${focus.id}`}]};
  return {resourceType:'Bundle',id:randomUUID(),type:'message',timestamp,
    meta:{tag:[{system:'https://example.invalid/sample-status',code:'synthetic-not-exchange-validated'}]},
    entry:[header,focus,...supporting].map(resource=>({fullUrl:`urn:uuid:${resource.id}`,resource}))};
}
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateEnvelope(bundle: unknown, expectedType: string): string[] {
  const errors: string[] = [];
  if (!isRecord(bundle) || bundle.resourceType !== 'Bundle' || bundle.type !== 'message' || !Array.isArray(bundle.entry)) return ['Expected a message Bundle'];
  if (typeof bundle.timestamp !== 'string' || !Number.isFinite(Date.parse(bundle.timestamp))) errors.push('Invalid bundle timestamp');
  const entries = bundle.entry;
  const urls = new Set<string>();
  const validEntries: { fullUrl: string; resource: Resource }[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || !isRecord(entry.resource)) {
      errors.push('Each bundle entry must contain a resource'); continue;
    }
    const resource = entry.resource;
    if (typeof resource.id !== 'string' || !resource.id || typeof resource.resourceType !== 'string' || !resource.resourceType || typeof entry.fullUrl !== 'string' || entry.fullUrl !== `urn:uuid:${resource.id}` || urls.has(entry.fullUrl)) {
      errors.push('Missing, duplicated or inconsistent entry identity'); continue;
    }
    urls.add(entry.fullUrl);
    validEntries.push({ fullUrl: entry.fullUrl, resource: resource as Resource });
  }
  const header = isRecord(entries[0]) && isRecord(entries[0].resource) ? entries[0].resource : undefined;
  if (header?.resourceType !== 'MessageHeader') errors.push('MessageHeader must be first');
  const event = expectedType === 'Claim' ? 'claim-request' : 'eligibility-request';
  if (header?.eventCoding?.system !== EVENT_SYSTEM || header?.eventCoding?.code !== event) errors.push('Incorrect message event');
  if (!header?.source?.endpoint || !header?.sender?.identifier?.value || !header?.destination?.[0]?.endpoint) errors.push('Missing routing data');
  const focus = validEntries.filter(entry => entry.resource.resourceType === expectedType);
  if (focus.length !== 1 || header?.focus?.[0]?.reference !== focus[0]?.fullUrl) errors.push('Focus does not identify the request');
  const seen = new WeakSet<object>();
  const check = (value: unknown, depth: number): void => {
    if (!value || typeof value !== 'object') return;
    if (depth > 100 || seen.has(value)) { errors.push('Cyclic or excessively nested input'); return; }
    seen.add(value);
    if (isRecord(value) && typeof value.reference === 'string' && !urls.has(value.reference)) errors.push(`Unresolved reference: ${value.reference}`);
    for (const child of Object.values(value)) check(child, depth + 1);
    seen.delete(value);
  };
  check(bundle, 0);
  return errors;
}
