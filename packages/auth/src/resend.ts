import { Resend } from "resend";

import { authEnv } from "../env";

export const resend = new Resend(authEnv().RESEND_API_KEY);
