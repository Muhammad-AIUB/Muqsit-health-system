import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';

// PatientChatMessage.author cascades on a user delete. Messages an account wrote
// in OTHER practices' patient chats are part of those practices' clinical
// conversation, so a permanent delete that would erase them is refused.
describe('AdminService.hardDelete', () => {
  const trashed = { id: 'u1', role: 'professional', deletedAt: new Date() };

  it('refuses while the account has messages in other doctors\' patient chats', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue(trashed),
      countChatMessagesInOtherPractices: jest.fn().mockResolvedValue(3),
      remove: jest.fn(),
    };
    const auth = { revokeAllForUser: jest.fn() };
    const service = new AdminService(users as never, {} as never, auth as never);

    await expect(service.hardDelete('u1')).rejects.toBeInstanceOf(ConflictException);
    expect(users.remove).not.toHaveBeenCalled();
    expect(auth.revokeAllForUser).not.toHaveBeenCalled();
  });
});
