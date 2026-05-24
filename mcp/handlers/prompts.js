import { getPromptForProfile, listPromptsForProfile } from "../hosts/prompts.js";

export async function handlePromptsList(message, deps) {
  return { prompts: listPromptsForProfile(deps.hostProfile) };
}

export async function handlePromptsGet(message, deps) {
  const params = message.params || {};
  return getPromptForProfile(params.name, params.arguments || {}, deps.hostProfile);
}
