"""Direct runner — imports the test module and runs it."""
import os
import sys

BACKEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "finalyear-main-main", "tnt-backend-main")
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

os.environ.setdefault("SMS_ENABLED", "false")

from tests.test_sms_dispatch import *

import unittest

loader = unittest.TestLoader()
classes = [
    TestUrgentEventSMSSent,
    TestPromotionalSMSNotSent,
    TestSMSFallbackSuppression,
    TestSMSMessageContent,
    TestExistingCallersFlagFalse,
    TestSlotCancellationSMSTriggered,
    TestPerUserSMSFallbackPreference,
]
suite = unittest.TestSuite()
for cls in classes:
    suite.addTests(loader.loadTestsFromTestCase(cls))

runner = unittest.TextTestRunner(verbosity=2)
result = runner.run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
