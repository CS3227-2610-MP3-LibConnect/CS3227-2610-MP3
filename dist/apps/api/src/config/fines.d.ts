declare const defaultLostBookFineMinorUnits = 2000;
declare const defaultOverdueFineMinorUnits = 500;
declare const defaultOverdueGraceHours = 72;
declare const overdueFinePolicyKey = "sgd-fixed-500-after-72h-v1";
export declare function getLostBookFineMinorUnits(): number;
export declare function getOverdueFinePolicy(): {
    policyKey: string;
    amountMinorUnits: number;
    graceHours: number;
};
export { defaultLostBookFineMinorUnits, defaultOverdueFineMinorUnits, defaultOverdueGraceHours, overdueFinePolicyKey };
