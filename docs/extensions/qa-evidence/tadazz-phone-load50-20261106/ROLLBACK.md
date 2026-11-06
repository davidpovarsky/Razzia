# ROLLBACK PLAN & PROCEDURES: TADAZZ TELEPHONY LOAD TEST & GATEWAY

**Generated:** 2026-11-06  
**Environment:** Oracle Cloud Infrastructure (`ubuntu@132.145.25.168`) & Windows Pilot Gateway  
**Production Status During Test:** **100% UNTOUCHED / ZERO PRODUCTION CHANGES**

---

## 1. Production Impact Audit
During this test cycle:
- The production Docker container `tadazz` (running image `tadazz:eb71474` on port `127.0.0.1:3000`) was **never restarted, stopped, modified, or migrated**.
- The production data directory `/var/lib/tadazz-release-5312660/config` was **never accessed, mounted, or written to**.
- All stress testing, quiz fixtures, 50-participant loads, and gateway callback evaluations were strictly directed at the isolated test container `tadazz-load50-20261106` on port `127.0.0.1:3245`.
- Production health check `http://127.0.0.1:3000/api/health` remained continuously at **HTTP 200 OK** with 0.01% CPU and ~59.87 MiB memory.

## 2. Temporary Test Artifacts & Cleanup
The only resources created for this QA evaluation were:
1. Isolated QA Docker Container on Oracle: `tadazz-load50-20261106` (bind mount `/tmp/tadazz-load50-20261106:/app/config`, published at `127.0.0.1:3245`).
2. Temporary scripts in Oracle `/tmp`: `/tmp/load_test_oci.py`, `/tmp/full_game_50x10.py`, `/tmp/load50_oci_isolated.py`, `/tmp/full_game_50x10.json`, `/tmp/latencies.csv`.
3. Windows temporary background SSH tunnel (port `3245 -> 127.0.0.1:3245`).
4. Windows test gateway listener on port `38992` (automatically stopped at test completion).

### Immediate Cleanup Commands (if decommissioning QA container is desired)
To stop and remove only the test container and its scratch volume without impacting production:
```bash
# On Oracle:
sudo docker stop tadazz-load50-20261106
sudo docker rm tadazz-load50-20261106
sudo rm -rf /tmp/tadazz-load50-20261106 /tmp/load_test_oci.py /tmp/full_game_50x10.py /tmp/full_game_50x10.json /tmp/latencies.csv
```

## 3. Future Production Deployment Rollback (Reference Only)
If the telephony gateway and fail-closed secret verification are authorized for production deployment in a future release window:
1. **Pre-deployment State Capture:**
   - Record current image: `tadazz:eb71474`
   - Backup database: `cp /var/lib/tadazz-release-5312660/config/*.sqlite /backup/`
2. **Rollback Trigger Conditions:**
   - Any 5xx error spike on `/api/games/pilot-phone` > 1%
   - Memory consumption exceeding 500 MiB
   - Unhandled crash or restart loop in supervisord
3. **Rollback Execution:**
   ```bash
   sudo docker stop tadazz
   sudo docker rm tadazz
   sudo docker run -d --name tadazz \
     --restart unless-stopped \
     -p 127.0.0.1:3000:3000 \
     -v /var/lib/tadazz-release-5312660/config:/app/config \
     tadazz:eb71474
   ```
4. **Verification:**
   ```bash
   curl -fsS http://127.0.0.1:3000/api/health
   ```
