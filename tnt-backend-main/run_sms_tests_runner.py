"""Temporary runner that changes to the backend dir and runs the tests."""
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

# Disable SMS sending by default for tests
os.environ.setdefault("SMS_ENABLED", "false")

import unittest
loader = unittest.TestLoader()
suite = loader.discover("tests", pattern="test_sms_dispatch.py")
runner = unittest.TextTestRunner(verbosity=2)
result = runner.run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
