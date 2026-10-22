export declare function validateOrigin(name: string, value: string): string;
export declare function resolveApiOrigin({ nodeEnv, apiOrigin, port }: {
    nodeEnv?: string;
    apiOrigin?: string;
    port: number;
}): string;
