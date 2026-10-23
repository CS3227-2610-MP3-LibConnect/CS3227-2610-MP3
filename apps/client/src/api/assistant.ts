import { apiRequest } from './base.js';

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

export const assistantApi = {
  chat(input: AssistantChatInput): Promise<AssistantChatResponse> {
    const question = input.question;
    const history = (input.history ?? [])
      .slice(-10)
      .map(({ role, content }) => ({ role, content }));
    return apiRequest<AssistantChatResponse>('/member/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ question, history }),
    });
  },
};
