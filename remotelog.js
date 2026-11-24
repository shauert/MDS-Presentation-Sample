/* Remote analytics logger.
 *
 * Sends small JSON events (start, answer, review, skip, complete) to a Google
 * Apps Script web app, which appends them to a Google Sheet. Canvas's SCORM
 * tool only keeps the latest score, so this is where per question analytics
 * come from.
 *
 * To turn it on, deploy the Apps Script web app and paste its URL into
 * endpoint below. While endpoint is empty, this file does nothing at all.
 */
(function (window) {
  "use strict";

  var CONFIG = {
    // Paste the Apps Script web app URL here (it starts with https://script.google.com/).
    endpoint: "",

    // Must match TOKEN in the Apps Script. It deters casual junk posts but is
    // visible in this file, so it is not a secret.
    token: "9cdc6ed9b31db645018956c8",

    // Identifies which lab the events belong to in the shared sheet.
    labId: "mds-narrated",

    // false: events are anonymous, tied only to a random per launch session id.
    // true: also sends the learner ID and name that the LMS provides to the
    // package. Only turn this on if your institution's data policy allows
    // student identifiers to be stored in the destination Google account.
    captureIdentity: false
  };

  // Starts with a letter so Google Sheets never reads it as a number.
  var sessionId = "s" + makeId(11);
  var sequence = 0;

  function makeId(length) {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var out = "";
    var i;
    try {
      var buf = new Uint8Array(length);
      window.crypto.getRandomValues(buf);
      for (i = 0; i < length; i++) out += chars.charAt(buf[i] % chars.length);
    } catch (e) {
      out = "";
      for (i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function enabled() {
    return typeof CONFIG.endpoint === "string" && CONFIG.endpoint.indexOf("https://") === 0;
  }

  function post(text, attempt) {
    function retry() {
      if (attempt < 3) {
        setTimeout(function () { post(text, attempt + 1); }, 2000 * attempt);
      }
    }
    try {
      if (window.fetch) {
        // text/plain keeps this a simple cross origin request, so the browser
        // sends it without a preflight, which Apps Script does not answer.
        window.fetch(CONFIG.endpoint, {
          method: "POST",
          mode: "no-cors",
          keepalive: true,
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: text
        }).catch(retry);
        return;
      }
    } catch (e) { /* fall through to sendBeacon */ }
    try {
      if (window.navigator && window.navigator.sendBeacon &&
          window.navigator.sendBeacon(CONFIG.endpoint, text)) {
        return;
      }
    } catch (e2) { /* fall through to retry */ }
    retry();
  }

  function send(eventName, fields) {
    if (!enabled()) return;
    try {
      var f = fields || {};
      var payload = {
        token: CONFIG.token,
        eventId: sessionId + "-" + (++sequence),
        lab: CONFIG.labId,
        session: sessionId,
        event: eventName,
        ts: new Date().toISOString(),
        learnerId: "",
        learnerName: ""
      };
      if (CONFIG.captureIdentity && window.ScormWrapper && window.ScormWrapper.getLearner) {
        var who = window.ScormWrapper.getLearner();
        payload.learnerId = who.id;
        payload.learnerName = who.name;
      }
      var keys = ["q", "attempt", "response", "correctResponse", "result",
                  "latency", "score", "max", "status", "sessionSeconds"];
      for (var i = 0; i < keys.length; i++) {
        if (f[keys[i]] !== undefined) payload[keys[i]] = f[keys[i]];
      }
      if (typeof payload.latency === "number") {
        payload.latency = Math.round(payload.latency * 100) / 100;
      }
      post(JSON.stringify(payload), 1);
    } catch (e) {
      // Analytics must never interrupt the lesson.
    }
  }

  window.RemoteLog = { send: send, config: CONFIG, sessionId: sessionId };
})(window);
