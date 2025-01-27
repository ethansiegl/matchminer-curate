export interface Trial {
    curation_status: string;
    archived: string;
    protocol_no: string;
    nct_id: string;
    long_title: string;
    short_title: string;
    phase: string;
    summary: string;
    sponsor: string;
    drug_list: object;
    protocol_target_accrual: number;
    site_list: object;
    protocol_type: string;
    age: string;
    principal_investigator: string;
    prior_treatment_requirement: Array<String>;
    status: string;
    staff_list: object;
    treatment_list: { step: Array<Step> };
}
interface Step {
    match?: Array<Match>;
    arm?: Array<Arm>;
}
interface Arm {
    arm_description: string; // Arm name.
    arm_info: string; // Real arm description. Store in Firebase and do not send to MongoDB.
    match?: Array<Match>;
}
// interface DoseLevel {
//     match?: Array<Match>;
//     level_internal_id: number;
//     level_code: string;
//     level_description: string;
//     level_suspended: string;
// }
interface Match { }

export interface Additional {
    note?: string;
}
