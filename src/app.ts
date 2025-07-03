import { createBot, MemoryDB, createProvider} from '@builderbot/bot'
import AIClass from './services/ia';
import flows from './flows';
import { MetaProvider as Provider } from '@builderbot/provider-meta'

const ai = new AIClass(process.env.OPEN_API_KEY, 'gpt-3.5-turbo-16k')

const main = async () => {
const provider = createProvider(Provider, {
    jwtToken: process.env.JWT_TOKEN,
    numberId: process.env.NUMBER_ID,
    verifyToken: process.env.VERIFY_TOKEN,
    version: 'v22.0'
})

await createBot({
    database: new MemoryDB(),
    provider,
    flow: flows
}, { extensions: { ai } })



}

main()