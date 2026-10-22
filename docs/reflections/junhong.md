orchestrator modified plans before asking for permission. it did ask for permission after making the changes. need to enforce guardrails to prevent this in the future.


orchestrator-subagent workflow with TDD integrated runs quite slowly.
maybe future implementation can spawn multiple test writers first, let them write all the tests, and then one dedicated coder writes the code sequentially. after coder completes writing, coder moves on to next task, spawn a checker to check the code, and fix it if needed. improves efficiency by not having to wait for test writer at the start of each task, and wait for verifier to verify at the end of each task before moving on. but overall time save should be not that much more.


ai chatbot assumes user intent, and provides a response to the member's question that is incorrect or not accurate. consider the following example:

prompt:
    how can i order a book

    Context: ordering of books is not a supported feature of libconnect

response:
    To "order" a book, which in LibConnect is done via reservations for items with no available copies, ...

ai chatbot implied that there is an 'order' function when there isnt

fix:
    allowed inference of member intent, but added guardrails so that the chatbot will specify its assumptions before providing the answer


ai chatbot produces invalid responses sometimes

prompt:
    can you help me borrow a book

reseponse:
    My Loans

fix:
    introduced a validation mechanism, chatbot will look at the member's prompt again and look at the generated response. if it is not appropriate, generate another response


chatbot invents facts.

prompt:
    can i not pay my fines

response:
    My Fines

    Yes, you can choose not to pay your fines. However, please be aware that unpaid fines may prevent you from borrowing new items or making new reservations until the balance is cleared.

    To view the exact amount of any outstanding fines and your account status, please visit My Fines.

fix:
    implement guardrails to ensure that agent does not invent facts, and for information that the chatbot does not have, direct the member to seek clarification from staff.
