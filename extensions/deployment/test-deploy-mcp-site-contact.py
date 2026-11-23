#!/usr/bin/env python3
"""Contact activation guards: synthetic data only, no Docker or email sending."""
import argparse
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("contact_deploy_operator", Path(__file__).with_name("deploy-mcp-site.py"))
OP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OP)
RECIPIENT = "hello@tadazz.com"


def original():
    return {
        "Id": "a" * 64, "Image": "sha256:" + "b" * 64,
        "Config": {
            "Env": ["TADAZZ_ACCOUNTS_ENABLED=true", "TADAZZ_PACKAGE_INSTALLER_ENABLED=false",
                    "RESEND_API_KEY=synthetic-secret-retained",
                    "TADAZZ_AUTH_EMAIL_FROM=Accounts <accounts@example.invalid>",
                    "TADAZZ_CONTACT_EMAIL_TO=previous@example.invalid",
                    "KEEP=retained"],
            "Labels": {"existing": "retained"},
        },
        "HostConfig": {"NetworkMode": "bridge", "Memory": 1024**3},
    }


def options(recipient=RECIPIENT):
    return argparse.Namespace(
        contact_email_to=recipient, revision="f" * 40,
        expected_config_sha256="c" * 64, qualification_receipt=None,
        qualification_sha256=None, release_dir=None,
    )


class ContactOperatorTests(unittest.TestCase):
    def test_accepts_one_bare_mailbox_and_rejects_lists_headers_or_ambiguous_values(self):
        self.assertIsNone(OP.contact_email_to(argparse.Namespace()))
        for value in (RECIPIENT, "event.team+test@sub.example.com"):
            self.assertEqual(OP.contact_email_to(options(value)), value)
        invalid = ("", " hello@tadazz.com", "hello@tadazz.com ",
                   "Hello <hello@tadazz.com>", "a@example.com,b@example.com",
                   "a@example.com\nBcc:b@example.com", "a@example.com\r\n",
                   "mailto:hello@tadazz.com", "@tadazz.com", "hello@tadazz",
                   ".hello@tadazz.com", "hello.@tadazz.com", "he..llo@tadazz.com",
                   "hello@-tadazz.com", "hello@tadazz-.com", "a" * 65 + "@tadazz.com",
                   "hello@" + "a" * 64 + ".com", 7, [], "שלום@tadazz.com")
        for value in invalid:
            with self.subTest(value=value), self.assertRaisesRegex(OP.GateError, "^CONTACT_EMAIL_TO_INVALID$"):
                OP.contact_email_to(options(value))

    def test_opt_in_changes_only_destination_and_preserves_sender_secret_and_host(self):
        old = original()
        before = copy.deepcopy(old)
        default = OP.replacement_payload(old, {"Id": "candidate"}, "f" * 40, "run")
        enabled = OP.replacement_payload(old, {"Id": "candidate"}, "f" * 40, "run", contact_recipient=RECIPIENT)
        default_env, enabled_env = OP.env_map(default["Env"]), OP.env_map(enabled["Env"])
        self.assertEqual(old, before)
        self.assertEqual(default_env["TADAZZ_CONTACT_EMAIL_TO"], "previous@example.invalid")
        self.assertEqual(enabled_env["TADAZZ_CONTACT_EMAIL_TO"], RECIPIENT)
        self.assertEqual({key for key in enabled_env if enabled_env[key] != default_env.get(key)},
                         {"TADAZZ_CONTACT_EMAIL_TO"})
        self.assertEqual(enabled["HostConfig"], old["HostConfig"])
        self.assertEqual(enabled_env["RESEND_API_KEY"], OP.env_map(old["Config"]["Env"])["RESEND_API_KEY"])
        self.assertEqual(enabled_env["TADAZZ_AUTH_EMAIL_FROM"], default_env["TADAZZ_AUTH_EMAIL_FROM"])

    def test_activation_requires_existing_transport_and_never_invents_sender_or_key(self):
        for missing in ("RESEND_API_KEY", "TADAZZ_AUTH_EMAIL_FROM"):
            old = original()
            old["Config"]["Env"] = [item for item in old["Config"]["Env"] if not item.startswith(missing + "=")]
            with self.subTest(missing=missing), self.assertRaisesRegex(OP.GateError, "^CONTACT_MAIL_TRANSPORT_REQUIRED$"):
                OP.replacement_payload(old, {"Id": "candidate"}, "f" * 40, "run", contact_recipient=RECIPIENT)
            # Omission retains the historical deployment contract.
            OP.replacement_payload(old, {"Id": "candidate"}, "f" * 40, "run")
        old = original()
        old["Config"]["Env"] = [item for item in old["Config"]["Env"] if not item.startswith("TADAZZ_AUTH_EMAIL_FROM=")]
        old["Config"]["Env"].append("TADAZZ_CONTACT_EMAIL_FROM=Contact <contact@example.invalid>")
        result = OP.replacement_payload(old, {"Id": "candidate"}, "f" * 40, "run", contact_recipient=RECIPIENT)
        self.assertEqual(OP.env_map(result["Env"])["TADAZZ_CONTACT_EMAIL_FROM"], "Contact <contact@example.invalid>")

    def test_qualification_cannot_be_reused_for_another_or_unproved_destination(self):
        old, args = original(), options()
        image = {"Id": "sha256:" + "d" * 64}
        desired = OP.desired_package_container(old, contact_recipient=RECIPIENT)
        with tempfile.TemporaryDirectory(prefix="contact-qualification-synthetic-") as directory:
            args.release_dir = directory
            file = Path(directory) / "qualification.json"
            args.qualification_receipt = str(file)
            receipt = {
                "success": True, "revision": args.revision, "image": image["Id"],
                "sourceImage": old["Image"], "sourceContainer": old["Id"],
                "configSha256": args.expected_config_sha256,
                "finishedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
                "contactEmailTo": RECIPIENT,
                "candidateCloneBoot": {
                    "passed": True, "nativeApplicationPreview": {"synthetic": True},
                    "packageCapabilities": OP.package_probe_proof(OP.package_probe_policy(desired)),
                    "contactMail": {"recipient": RECIPIENT, "available": True},
                },
            }

            def write(value):
                file.write_text(json.dumps(value))
                file.chmod(0o600)
                args.qualification_sha256 = OP.sha256(file)

            with patch.object(OP, "plain_path", side_effect=lambda path, **unused: Path(path)), \
                 patch.object(OP, "native_preview_files", return_value=[]), \
                 patch.object(OP, "native_preview_proof", return_value={"synthetic": True}):
                write(receipt)
                self.assertTrue(OP.validate_qualification(args, old, image)["candidateCloneBootPassed"])
                for target in (None, "different@example.com"):
                    changed = copy.deepcopy(receipt)
                    changed["contactEmailTo"] = target
                    write(changed)
                    with self.subTest(target=target), self.assertRaisesRegex(OP.GateError, "^CONTACT_EMAIL_QUALIFICATION_MISMATCH$"):
                        OP.validate_qualification(args, old, image)
                for proof in (None, {"recipient": "different@example.com", "available": True},
                              {"recipient": RECIPIENT, "available": False}):
                    changed = copy.deepcopy(receipt)
                    changed["candidateCloneBoot"]["contactMail"] = proof
                    write(changed)
                    with self.subTest(proof=proof), self.assertRaisesRegex(OP.GateError, "^CONTACT_MAIL_RESTORE_QUALIFICATION_MISSING$"):
                        OP.validate_qualification(args, old, image)
                args.contact_email_to = None
                write(receipt)
                with self.assertRaisesRegex(OP.GateError, "^CONTACT_EMAIL_QUALIFICATION_MISMATCH$"):
                    OP.validate_qualification(args, old, image)
                receipt.pop("contactEmailTo")
                write(receipt)
                with self.assertRaisesRegex(OP.GateError, "^CONTACT_MAIL_RESTORE_QUALIFICATION_UNEXPECTED$"):
                    OP.validate_qualification(args, old, image)
                # Historical receipts remain valid when the option is omitted.
                receipt["candidateCloneBoot"].pop("contactMail")
                write(receipt)
                self.assertTrue(OP.validate_qualification(args, old, image)["candidateCloneBootPassed"])

    def test_public_probe_checks_config_and_cache_without_sending_mail(self):
        diagnostic = {"path": "/api/contact/config", "method": "GET", "status": 200,
                      "expectedStatus": 200, "contentType": "application/json"}
        response = {"status": 200, "headers": {"content-type": "application/json", "cache-control": "no-store"},
                    "body": b'{"available":true}', "diagnostic": diagnostic}
        with patch.object(OP, "request", return_value=response) as request:
            self.assertEqual(OP.contact_mail_probe(OP.PUBLIC_ORIGIN),
                             {"available": True, "noStore": True, "messageSent": False})
            request.assert_called_once_with(OP.PUBLIC_ORIGIN, "/api/contact/config", 200)
        for body, cache, error in ((b'{"available":false}', "no-store", "PROBE_JSON_VALUE"),
                                   (b'{"available":true,"extra":1}', "no-store", "PROBE_JSON_VALUE"),
                                   (b'{"available":true}', "public, max-age=60", "CONTACT_CONFIG_CACHE_POLICY")):
            changed = copy.deepcopy(response)
            changed["body"], changed["headers"]["cache-control"] = body, cache
            with self.subTest(body=body, cache=cache), patch.object(OP, "request", return_value=changed), \
                 self.assertRaisesRegex(OP.GateError, "^" + error + "$"):
                OP.contact_mail_probe(OP.PUBLIC_ORIGIN)


if __name__ == "__main__":
    unittest.main()
