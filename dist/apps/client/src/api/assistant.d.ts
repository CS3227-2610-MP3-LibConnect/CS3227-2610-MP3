export interface AssistantTurn {
    role: 'user' | 'assistant';
    content: string;
}
export interface AssistantChatInput {
    question: string;
    history?: AssistantTurn[];
}
export interface AssistantChatResponse {
    answer: string;
}
export declare const assistantApi: {
    chat(input: AssistantChatInput): Promise<AssistantChatResponse>;
};
