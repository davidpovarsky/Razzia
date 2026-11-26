import { validateLegalPolicies } from "./legal-policies"

/** Complete English policy text and public seller details approved by the owner. */
const approvedPolicyBundle: unknown = {
  status: "approved",
  version: "2026-11-27-1",
  effectiveDate: "2026-11-27",
  approvedAt: "2026-11-26T22:42:28Z",
  approvedBy: "Owner via explicit approval in the Tadazz payment setup chat",
  locale: "en",
  seller: {
    name: "Golda Sterling trading as Tadazz",
    address: "102 Fairview Road, London, N15 6TP, United Kingdom",
    contactEmail: "hello@tadazz.com",
  },
  documents: {
    terms: {
      title: "Terms and conditions",
      sections: [
        {
          id: "service",
          heading: "Tadazz and these terms",
          paragraphs: [
            "Tadazz is operated by Golda Sterling trading as Tadazz, at the address above. These terms cover your access to our software for preparing and hosting interactive quizzes and gameshows.",
            "Where you purchase through Paddle, Paddle is the authorised reseller and its Buyer Terms govern the payment transaction. These terms govern the Tadazz software and service. Mandatory consumer rights take priority over any inconsistent term.",
          ],
        },
        {
          id: "accounts",
          heading: "Accounts and event responsibility",
          paragraphs: [
            "Provide accurate account information, keep your sign-in details private and contact hello@tadazz.com if you suspect unauthorised access. You must have authority to enter this agreement and to organise the event for which you use Tadazz.",
            "You are responsible for the questions, answers, images, audio, video and participant information you submit. Use material you own or have permission to use, and provide participants with appropriate information and obtain permissions where required, including where an event involves children.",
          ],
        },
        {
          id: "licences",
          heading: "Licences and participant limits",
          paragraphs: [
            "Each offer identifies its price, number of game starts, participant limit and any duration. The licence and purchase confirmation determine what you receive. A single-game licence covers one new hosted game; reconnecting to the same game does not purchase another game.",
            "A one-time payment does not create an automatically renewing subscription. A fixed-duration licence, if offered, ends at the expiry shown for that purchase. Unused single-game credits have no fixed expiry unless the offer expressly states one.",
            "Participant limits apply to distinct participant identities in a game, including supported participation methods. Telephone participation and any included minutes are available only when expressly included in the purchased offer. Third-party telephone or network charges are not a Tadazz licence payment.",
          ],
        },
        {
          id: "payment",
          heading: "Payment and access",
          paragraphs: [
            "Prices are displayed on the pricing page and the final payable total, including applicable tax, is confirmed by Paddle before payment. Access is provisioned when the payment is confirmed by the payment provider.",
            "You can review your own licences in your account. Contact hello@tadazz.com with your purchase reference if paid access is missing. Do not send full card details to Tadazz.",
          ],
        },
        {
          id: "use",
          heading: "Permitted use and your content",
          paragraphs: [
            "Use Tadazz lawfully. Do not infringe another person's rights, interfere with the service, attempt unauthorised access or use the platform for fraud. Your licence gives you access to the features and allowances purchased; it does not transfer ownership of Tadazz.",
            "You retain your rights in your own content and authorise us to store, process and display it as needed to provide the service and your events. Notices and licences for open-source components continue to apply to those components.",
          ],
        },
        {
          id: "availability",
          heading: "Preparing and running a show",
          paragraphs: [
            "Prepare and preview your show before your event and check the devices, display, audio and connection you intend to use. Availability may be affected by maintenance, faults or third-party networks; continuous or error-free service is not guaranteed.",
            "If a material service fault prevents delivery of a purchased feature, contact us so we can investigate and offer an appropriate remedy. This may include correction, replacement access or a refund where required. Nothing in these terms excludes a right or liability that cannot lawfully be excluded.",
          ],
        },
        {
          id: "contact",
          heading: "Changes, disputes and contact",
          paragraphs: [
            "We may update these terms for future use and will identify the current version and effective date. Changes do not retrospectively remove rights attached to a completed purchase.",
            "English law governs these service terms, subject to mandatory protections that apply where a consumer lives. This does not prevent a consumer from using a court or remedy available under mandatory law. Contact hello@tadazz.com about the service; Paddle handles payment enquiries through the details in your receipt.",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy policy",
      sections: [
        {
          id: "responsibility",
          heading: "Who is responsible",
          paragraphs: [
            "Golda Sterling trading as Tadazz is responsible for the account, service and support information described in this policy. Our contact address and email are shown above.",
            "An event organiser decides what participant information and content to submit and how to use a show. For questions about an organiser's event or participant list, contact that organiser as well as Tadazz where appropriate.",
          ],
        },
        {
          id: "information",
          heading: "Information we process",
          paragraphs: [
            "Account information includes your email, authentication records and account status. We store password-verification information rather than a readable account password.",
            "Service information includes the quizzes and media you upload, game and room identifiers, participant names or identifiers, responses, scores and results. Where an organiser enables telephone participation or imports a contact list, this may also include participant telephone information.",
            "We process messages sent through the contact form or support mailbox, purchase and licence references, and technical records needed to operate and secure the service, such as network, browser, session and error information. Paddle processes payment details; Tadazz does not receive or store complete payment-card details.",
          ],
        },
        {
          id: "purposes",
          heading: "Why information is used",
          paragraphs: [
            "We use account and service information to create and authenticate accounts, save content, host events, reconnect participants, display results and provide purchased access. Where applicable, this processing is necessary to perform our contract with the account holder.",
            "We use support and technical information to respond to requests, diagnose faults, secure accounts and prevent misuse. We rely on our legitimate interests in operating a reliable and secure service, taking account of affected people's interests. We also keep information where necessary to meet legal obligations or establish or defend legal claims.",
          ],
        },
        {
          id: "providers",
          heading: "Providers and processing locations",
          paragraphs: [
            "The current application and its account, game and media storage are hosted on Oracle Cloud infrastructure in the United Kingdom (London region). Resend delivers account and contact-form email, and our business mailbox uses Apple iCloud Mail.",
            "These email providers and Paddle may process information outside the United Kingdom under their applicable service and data-protection arrangements. Resend's Data Processing Addendum describes its contractual transfer safeguards, including its UK addendum: https://resend.com/legal/dpa. Apple's privacy information is at https://www.apple.com/legal/privacy/.",
            "Paddle acts as the reseller for payment transactions and explains its own payment-data processing at https://www.paddle.com/legal/privacy. Contact hello@tadazz.com for information about a particular provider or transfer relevant to your data.",
          ],
        },
        {
          id: "retention",
          heading: "Retention and deletion",
          paragraphs: [
            "We retain account information, saved shows and media for the time needed to provide the associated account and service, handle support and meet applicable legal obligations. You can delete content using the available controls or contact us about closing an account or deleting personal information.",
            "For support, security, billing and dispute records, retention depends on the purpose, the relevant legal obligations and whether a request, incident or claim remains unresolved. Copies in operational backups may remain until those backups are replaced or deleted. We do not promise a fixed automatic deletion period that the service does not implement.",
          ],
        },
        {
          id: "browser",
          heading: "Cookies and browser storage",
          paragraphs: [
            "The application uses browser storage for sign-in and reconnect information, language preferences, checkout continuity and local recovery of unsaved editing work. Local drafts are separate from a saved server copy and may remain until replaced, removed by the application or cleared through your browser.",
            "Clearing site data can sign you out and remove locally stored preferences or unsaved work. Cookies or storage used by an opened Paddle checkout are also described in Paddle's privacy information.",
          ],
        },
        {
          id: "rights",
          heading: "Your choices and rights",
          paragraphs: [
            "Depending on the applicable law, you may request access, correction, deletion, restriction or portability of your personal information. Where processing relies on consent, you may withdraw it. We may need to verify your identity and consider the rights of other people before responding.",
            "You have the right to object to processing based on legitimate interests, including for reasons relating to your particular situation. Contact hello@tadazz.com to exercise this right or another privacy right.",
            "You may complain to the UK Information Commissioner's Office at https://ico.org.uk/ or to another competent regulator. Providing the information necessary to operate an account or event is required for those features; without it, we may be unable to provide them.",
          ],
        },
        {
          id: "updates",
          heading: "Updates and contact",
          paragraphs: [
            "We will identify the effective date of the published policy and update it when the service's relevant data practices change. For a privacy enquiry, use hello@tadazz.com and avoid including unnecessary sensitive information.",
          ],
        },
      ],
    },
    refunds: {
      title: "Refund and cancellation policy",
      sections: [
        {
          id: "requests",
          heading: "Requesting a refund",
          paragraphs: [
            "For a question about a charge or a refund request, contact hello@tadazz.com with your order reference, the email used to purchase and a brief explanation. Do not send full payment-card details.",
            "For a payment completed through Paddle, you can also use the support link in your receipt or visit https://paddle.net. Paddle's Buyer Terms and Refund Policy apply to its payment transactions.",
          ],
        },
        {
          id: "eligibility",
          heading: "When a refund is available",
          paragraphs: [
            "Except where required by applicable law or Paddle's applicable Buyer Terms and Refund Policy, purchases of Tadazz digital software licences are non-refundable. We may consider a discretionary refund case by case, taking account of the reason for the request and any use of the purchased licence.",
            "This policy does not remove statutory cancellation or withdrawal rights, or remedies for a product or service that is faulty, not as described or not supplied. A consumer may have a 14-day withdrawal right for an eligible purchase. We do not assume that immediate availability alone removes that right; any exception must meet the applicable legal requirements.",
          ],
        },
        {
          id: "faults",
          heading: "Service faults and replacement access",
          paragraphs: [
            "If a material fault prevents you from using a purchased feature, contact us promptly so we can investigate. We may correct the fault or provide replacement access for another event. Replacement access does not remove a right to a refund or another remedy required by law or Paddle's terms.",
          ],
        },
        {
          id: "periods",
          heading: "Single-game and fixed-duration licences",
          paragraphs: [
            "One-time game and fixed-duration licence purchases do not renew automatically. A fixed-duration licence ends when its stated period expires, so it does not require cancellation to prevent another payment.",
            "If a separately identified renewing subscription is offered in future, its billing period and cancellation terms must be shown before purchase. A Paddle subscription can be cancelled through its customer portal or Paddle support, with cancellation normally taking effect at the end of the paid period.",
          ],
        },
        {
          id: "processing",
          heading: "Processing and licence effects",
          paragraphs: [
            "An approved refund is normally returned through Paddle to the original payment method where possible. Processing time depends on the payment method and the rules applicable to the request; statutory withdrawal timing takes priority.",
            "A refunded or charged-back purchase may no longer provide rights to start new games. We do not delete your saved show merely because you request a refund. Your mandatory consumer rights and Paddle's applicable Refund Policy take priority over inconsistent wording in this policy.",
          ],
        },
      ],
    },
  },
}

export const publishedLegalPolicies =
  validateLegalPolicies(approvedPolicyBundle).published
