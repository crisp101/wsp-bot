import { BotContext, BotMethods } from "@builderbot/bot/dist/types";
import { handleHistory } from "../utils/handlehistory";

/**
 * Su funcion es almancenar en el state todos los mensajes que el usuario  escriba
 */
export default async ({ body }: BotContext, { state, }: BotMethods) => {
    await handleHistory({ content: body, role: 'user' }, state)
}