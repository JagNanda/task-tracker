import { focusSessionRepository } from "../repositories/focusSessionRepository";

export const focusService = {
  restore: focusSessionRepository.getActive,
  startFocus: focusSessionRepository.start,
  switchTask: focusSessionRepository.switchTask,
  startInterruption: focusSessionRepository.interrupt,
  resumeFromInterruption: focusSessionRepository.resumeInterruption,
  pauseFocus: focusSessionRepository.pause,
  resumeFocus: focusSessionRepository.resumePause,
  completeFocus: focusSessionRepository.complete,
  cancelActiveFocus: focusSessionRepository.cancel,
  changeDuration: focusSessionRepository.changeDuration,
};
