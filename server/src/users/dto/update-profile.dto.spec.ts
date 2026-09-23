import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

// The doctor's investigation groups (2026-09-24) arrive as a whole list on
// every save. A group must carry a name and at least one test name.
// Same options as the app's ValidationPipe (main.ts): unknown keys are
// stripped, not refused — and the service stores only name and tests anyway.
const errorsFor = async (body: unknown) =>
  validate(plainToInstance(UpdateProfileDto, body), { whitelist: true });

describe('UpdateProfileDto — investigationGroups', () => {
  it('accepts well-formed groups', async () => {
    expect(await errorsFor({ investigationGroups: [{ name: 'DM follow-up', tests: ['FBS', 'HbA1c'] }] })).toHaveLength(0);
  });

  it('accepts an empty list (the doctor removed every group)', async () => {
    expect(await errorsFor({ investigationGroups: [] })).toHaveLength(0);
  });

  it.each([
    [{ name: '', tests: ['FBS'] }],
    [{ name: 'X', tests: [] }],
    [{ name: 'X', tests: [5] }],
    [{ tests: ['FBS'] }],
    [{ name: 'X' }],
  ])('refuses %j', async (group) => {
    expect((await errorsFor({ investigationGroups: [group] })).length).toBeGreaterThan(0);
  });
});
