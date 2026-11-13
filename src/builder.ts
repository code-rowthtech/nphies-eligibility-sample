import {context,message,validateEnvelope,date,isRecord} from './common.ts';
import type {Input} from './common.ts';
export function build(input:Input,timestamp='2026-01-01T12:00:00Z') {
 const {make,ref,patient,provider,insurer,coverage}=context(input);
 const request=make('CoverageEligibilityRequest',{
  identifier:[{system:'https://example.invalid/eligibility',value:`synthetic-${input.patientId}`}],
  status:'active',purpose:['validation','benefits'],priority:{coding:[{system:'http://terminology.hl7.org/CodeSystem/processpriority',code:'normal'}]},
  patient:ref(patient),created:timestamp,servicedPeriod:{start:input.serviceDate,end:input.serviceDate},provider:ref(provider),insurer:ref(insurer),insurance:[{focal:true,coverage:ref(coverage)}]});
 return message(input,request,[patient,provider,insurer,coverage],timestamp);
}
export function validate(bundle:unknown):string[]{
 const errors=validateEnvelope(bundle,'CoverageEligibilityRequest');
 if(!isRecord(bundle)||!Array.isArray(bundle.entry))return errors;
 const request=bundle.entry.find((entry:unknown)=>isRecord(entry)&&isRecord(entry.resource)&&entry.resource.resourceType==='CoverageEligibilityRequest')?.resource;
 if(!request)return [...errors,'Missing eligibility request'];
 if(request.status!=='active' || !Array.isArray(request.purpose) || !request.purpose.includes('validation') || !request.purpose.includes('benefits'))errors.push('Invalid status/purpose');
 if(!request.patient?.reference || !request.provider?.reference || !request.insurer?.reference || !request.insurance?.[0]?.coverage?.reference)errors.push('Missing request references');
 try{date(request.servicedPeriod?.start);date(request.servicedPeriod?.end);}catch{errors.push('Invalid service dates');}
 return errors;
}
