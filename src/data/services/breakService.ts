import { timedBreakRepository } from "../repositories/activityRepositories";

export const breakService = {
  restore: timedBreakRepository.getActive,
  start: timedBreakRepository.start,
  finish: timedBreakRepository.finish,
};
