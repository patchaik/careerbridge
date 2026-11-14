import { recordPractice, tutorMessage } from "../lib/api/arena";
import { useAsyncAction } from "./useAsync";

export function useTutorMessage() {
  return useAsyncAction(tutorMessage);
}

export function useRecordPractice() {
  return useAsyncAction(recordPractice);
}
