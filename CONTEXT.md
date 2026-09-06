# Assistant

A proactive helper that keeps a notebook for one signed-in user.

## People and the helper

**User**:
A signed-in human. The owner of the Notebook.
_Avoid_: Conversation, account, caller, principal

**Assistant**:
The one helper that belongs to a User. There is one Assistant per User.
_Avoid_: Conversation, agent, chat

**Origin**:
The User recorded when the Assistant is created. The address of the Assistant is not the Origin.
_Avoid_: Instance name, parsed address, conversation id

## The notebook

**Note**:
A markdown document the User owns.
_Avoid_: Card, artifact, data-note, sandbox file

**Notebook**:
The User's full set of Notes. Each Note appears once. The latest write of that Note is the Note.
_Avoid_: History, transcript, stream, conversation, catalog

**Card**:
A picture of the Notebook drawn onto a chat reply after a Note is created or updated. Not the Notebook.
_Avoid_: Note, Notebook

## How the Assistant works

**Review**:
A scheduled look at the Notebook. Not a message from the User. The Assistant may add or update a Note. A look that changes no Note writes no Card. After a User joins, the look ends and the User is answered.
_Avoid_: Wake, heartbeat, chat turn, user message

**Stop**:
The User ending current Assistant work and anything already queued. Not the next Review.
_Avoid_: Cancel schedule, per-turn abort, rollback

**Skill**:
A named procedure, with templates, that the Assistant loads when the job matches.
_Avoid_: Instruction, style

**Instruction**:
Always-on voice and rules.
_Avoid_: Skill, style
