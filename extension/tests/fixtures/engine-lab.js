// In-page DOM tests for src/engine/dom.js + preview.js, run in a real browser by portal-smoke.mjs.
// Synthetic markup and synthetic applicant data only.
/* global MCEngine */
(function () {
  "use strict";
  const E = MCEngine;
  const lab = document.getElementById("lab");
  const leaf = (value) => ({ status: "available", value });
  const missing = { status: "missing", value: null };
  const FIELDS = {
    personal: {
      fullName: leaf("Lab Applicant"), fatherName: leaf("Lab Father"), motherName: leaf("Lab Mother"), dob: leaf("2000-02-29"),
      gender: leaf("female"), category: leaf("general"), religion: leaf("Lab Religion"), maritalStatus: leaf("married"), nationality: leaf("Indian"),
    },
    contact: { mobile: leaf("9000000301"), email: leaf("lab.applicant@test.local") },
    permanentAddress: { line: leaf("1 Lab Road"), village: leaf("Labpur"), tehsil: leaf("Lab Tehsil"), district: leaf("Pune"), state: leaf("Maharashtra"), pincode: leaf("411002") },
    correspondenceAddress: { line: leaf("2 Other Road"), village: leaf("Otherpur"), tehsil: leaf("Other Tehsil"), district: leaf("Nagpur"), state: leaf("Maharashtra"), pincode: leaf("440001") },
    education: { tenth: { board: leaf("Lab Board"), rollNumber: leaf("L10"), passingYear: leaf(2016), percentage: leaf(90) }, twelfth: { board: missing, rollNumber: missing, passingYear: missing, percentage: missing } },
    identity: { aadhaarMasked: leaf("XXXX-XXXX-9999"), panMasked: leaf("XXXXXX999Z") },
  };
  const results = [];
  const check = (name, cond, detail = "") => results.push({ name, ok: !!cond, detail: cond ? "" : String(detail) });
  const mount = (html) => {
    lab.innerHTML = html; // test fixture markup only
    return lab;
  };
  const byDomId = (descriptors, domId) => descriptors.find((d) => d.domId === domId);
  const form = { genericFields: true };
  const planFor = (overrides = {}, protectedIds = []) => {
    const { descriptors, refs } = E.dom.discover(document);
    const built = E.preview.buildPlan({ descriptors, form, overrides, protectedIds, fields: FIELDS });
    const signatures = {};
    for (const d of descriptors) signatures[d.id] = d.signature;
    return { descriptors, refs, plan: { items: built.items, signatures }, summary: built.summary };
  };
  const idOf = (p, domId) => byDomId(p.descriptors, domId)?.id;
  const itemOf = (p, domId) => p.plan.items.find((i) => i.id === idOf(p, domId));
  const resultOf = (res, p, domId) => res.results.find((r) => r.id === idOf(p, domId));
  const $ = (id) => document.getElementById(id);

  async function run() {
    // 1. Label / accessible-name sources
    mount(`
      <label for="a1">Father's Name</label><input id="a1">
      <label>Mother's Name <input id="a2"></label>
      <span id="l3a">Date of</span> <span id="l3b">Birth</span><input id="a3" type="date" aria-labelledby="l3a l3b">
      <input id="a4" aria-label="Email ID">
      <table><tr><td>Mobile Number</td><td><input id="a5"></td></tr></table>
      <div><div>Religion</div><input id="a6"></div>
      <input id="a7" placeholder="Nationality">
      <input id="a8" name="txtFatherName">`);
    let { descriptors } = E.dom.discover(document);
    const lbl = (id) => byDomId(descriptors, id)?.label;
    check("DOM: <label for>", lbl("a1") === "Father's Name", lbl("a1"));
    check("DOM: wrapping <label>", lbl("a2") === "Mother's Name", lbl("a2"));
    check("DOM: aria-labelledby (multiple ids)", lbl("a3") === "Date of Birth", lbl("a3"));
    check("DOM: aria-label", lbl("a4") === "Email ID", lbl("a4"));
    check("DOM: table 'label | control' row", lbl("a5") === "Mobile Number", lbl("a5"));
    check("DOM: nearby preceding text", lbl("a6") === "Religion", lbl("a6"));
    check("DOM: placeholder used for display only when unlabelled", lbl("a7") === "" && E.preview.displayLabel(byDomId(descriptors, "a7")) === "Nationality");
    let p = planFor();
    check(
      "DOM→plan: every label source maps to the right applicant field",
      ["a1", "a2", "a3", "a4", "a5", "a6"].every((id) => itemOf(p, id)?.status === "ready") &&
        itemOf(p, "a1").key === "personal.fatherName" && itemOf(p, "a2").key === "personal.motherName" && itemOf(p, "a3").key === "personal.dob" &&
        itemOf(p, "a4").key === "contact.email" && itemOf(p, "a5").key === "contact.mobile" && itemOf(p, "a6").key === "personal.religion" &&
        itemOf(p, "a8")?.key === "personal.fatherName",
      p.plan.items.map((i) => `${i.label}:${i.status}:${i.key}`).join(" | ")
    );
    check("DOM→plan: identical father fields → one ready, one duplicate", itemOf(p, "a8")?.status === "duplicate", itemOf(p, "a8")?.status);
    check("DOM→plan: placeholder-only 'Nationality' maps at reduced confidence", itemOf(p, "a7")?.key === "personal.nationality" && itemOf(p, "a7").confidence < 0.95, `${itemOf(p, "a7")?.status} ${itemOf(p, "a7")?.confidence}`);

    // 2. Required detection
    mount(`
      <label for="r1">Full Name</label><input id="r1" required>
      <label for="r2">Father's Name</label><input id="r2" aria-required="true">
      <label for="r3">Mother's Name <span>*</span></label><input id="r3">
      <label for="r4">Religion</label><input id="r4">`);
    ({ descriptors } = E.dom.discover(document));
    check(
      "DOM: required via attribute / aria-required / asterisk; optional otherwise",
      ["r1", "r2", "r3"].every((id) => byDomId(descriptors, id).required) && !byDomId(descriptors, "r4").required
    );

    // 3. Section context
    mount(`
      <fieldset><legend>Permanent Address</legend><label for="s1">PIN Code</label><input id="s1"></fieldset>
      <div role="group" aria-labelledby="g2"><span id="g2">Correspondence Address</span><label for="s2">PIN Code</label><input id="s2"></div>
      <h3>Present Address</h3><div><label for="s3">District</label><input id="s3"></div>
      <table><tr><td colspan="2">Permanent Address</td></tr><tr><td>Village</td><td><input id="s4"></td></tr></table>
      <label for="s6">Correspondence PIN Code</label><input id="s6">`);
    p = planFor();
    check("DOM: context word in the label itself → correspondence PIN", itemOf(p, "s6")?.key === "correspondenceAddress.pincode" && itemOf(p, "s6").status === "duplicate", JSON.stringify(itemOf(p, "s6")));
    check("DOM: fieldset legend → permanent address", itemOf(p, "s1")?.key === "permanentAddress.pincode" && itemOf(p, "s1").status === "ready", JSON.stringify(itemOf(p, "s1")));
    check("DOM: role=group aria-labelledby → correspondence", itemOf(p, "s2")?.key === "correspondenceAddress.pincode" && itemOf(p, "s2").status === "ready");
    check("DOM: preceding heading → correspondence (present)", itemOf(p, "s3")?.key === "correspondenceAddress.district" && itemOf(p, "s3").status === "ready");
    check("DOM: single-cell table heading row → permanent", itemOf(p, "s4")?.key === "permanentAddress.village" && itemOf(p, "s4").status === "ready");
    mount(`<label for="s5">PIN Code</label><input id="s5">`);
    p = planFor();
    check("DOM: PIN Code with no address context is not filled", itemOf(p, "s5")?.status === "low_confidence" && itemOf(p, "s5").reason === "no_section_context", JSON.stringify(itemOf(p, "s5")));

    // 4. Visibility
    mount(`
      <label for="v1">Full Name</label><input id="v1">
      <input id="v2" aria-label="Father's Name" style="display:none">
      <input id="v3" aria-label="Mother's Name" style="visibility:hidden">
      <input id="v4" aria-label="Religion" hidden>
      <div style="display:none"><input id="v5" aria-label="Email ID"></div>`);
    ({ descriptors } = E.dom.discover(document));
    check("DOM: visible vs display:none / visibility:hidden / hidden / hidden parent", byDomId(descriptors, "v1").visible && ["v2", "v3", "v4", "v5"].every((id) => !byDomId(descriptors, id).visible));
    p = planFor();
    check("DOM→plan: hidden fields excluded from the preview and counted", p.plan.items.length === 1 && p.summary.hiddenSkipped === 4, `${p.plan.items.length}/${p.summary.hiddenSkipped}`);

    // 5. Radio grouping + skipped controls + ARIA wrappers
    mount(`
      <form><fieldset><legend>Gender</legend><input type="radio" name="g" value="m" id="x1"> Male <input type="radio" name="g" value="f"> Female</fieldset></form>
      <form><fieldset><legend>Gender</legend><input type="radio" name="g" value="m" id="x2"> Male <input type="radio" name="g" value="f"> Female</fieldset></form>
      <input type="hidden" name="h"><input type="submit"><input type="button" value="b"><input type="reset"><input type="image" alt="i">
      <button>Go</button>
      <div role="textbox" aria-label="Wrapped"><input id="w1" aria-label="Full Name"></div>`);
    ({ descriptors } = E.dom.discover(document));
    const radios = descriptors.filter((d) => d.kind === "radio");
    check("DOM: radios grouped per form + name, with option labels", radios.length === 2 && radios.every((r) => r.choices.length === 2 && r.choices[1].text === "Female" && r.label === "Gender"), JSON.stringify(radios.map((r) => r.choices)));
    check("DOM: hidden/submit/button/reset/image inputs and buttons never discovered", descriptors.length === 3, descriptors.map((d) => `${d.tag}:${d.type}`).join(","));
    check("DOM: ARIA wrapper around a native control yields one field", descriptors.filter((d) => d.domId === "w1").length === 1 && !descriptors.some((d) => d.tag === "custom"));

    // 6. CAPTCHA proximity
    mount(`
      <div><label for="c1">Enter the text</label><img alt="captcha" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><input id="c1"></div>
      <div><img alt="captcha" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div><input id="c2" aria-label="Full Name"><input aria-label="a"><input aria-label="b"><input aria-label="c"></div></div>`);
    ({ descriptors } = E.dom.discover(document));
    check("DOM: input next to a CAPTCHA image is flagged; distant inputs are not", byDomId(descriptors, "c1").nearCaptcha && !byDomId(descriptors, "c2").nearCaptcha);

    // 7. Filling: approved only, values + events, every control type
    mount(`
      <form id="ff">
        <label for="t1">Full Name</label><input id="t1">
        <label for="t2">Father's Name</label><input id="t2">
        <label for="t3">Date of Birth</label><input id="t3" type="date">
        <label for="t4">Category</label><select id="t4"><option value="">Select</option><option value="1">General (UR)</option><option value="2">OBC</option></select>
        <fieldset><legend>Gender</legend><label><input type="radio" name="gg" value="M">Male</label><label><input type="radio" name="gg" value="F">Female</label></fieldset>
        <fieldset><legend>Correspondence Address</legend><label><input type="checkbox" id="t6"> Same as permanent address</label></fieldset>
        <label for="t7">Permanent Address</label><textarea id="t7"></textarea>
        <label for="t8">Email ID</label><input id="t8" type="email">
        <label for="t9">Enter OTP</label><input id="t9">
        <button type="submit" id="go">Submit</button>
      </form>`);
    const counts = { input: 0, change: 0, click: 0, submit: 0 };
    $("ff").addEventListener("input", () => (counts.input += 1));
    $("ff").addEventListener("change", () => (counts.change += 1));
    $("go").addEventListener("click", () => (counts.click += 1));
    $("ff").addEventListener("submit", (e) => {
      counts.submit += 1;
      e.preventDefault();
    });
    p = planFor();
    const statuses = Object.fromEntries(p.plan.items.map((i) => [i.label, i.status]));
    check(
      "Plan: text/date/select/radio/textarea/email ready; same-as-permanent unticked proposal; OTP protected",
      statuses["Full Name"] === "ready" && statuses["Date of Birth"] === "ready" && statuses.Category === "ready" && statuses.Gender === "ready" &&
        statuses["Permanent Address"] === "ready" && statuses["Email ID"] === "ready" && statuses["Enter OTP"] === "protected" && itemOf(p, "t6")?.value === false,
      JSON.stringify(statuses)
    );
    const approve = ["t1", "t3", "t4", "t7", "t8"].map((id) => idOf(p, id)).concat(p.plan.items.find((i) => i.kind === "radio").id, idOf(p, "t9"), "f999");
    let res = await E.dom.fill(p.plan, p.refs, approve, { settleMs: 0 });
    check(
      "Fill: approved fields set with the formatted values",
      $("t1").value === "Lab Applicant" && $("t3").value === "2000-02-29" && $("t4").value === "1" && $("t7").value === "1 Lab Road" && $("t8").value === "lab.applicant@test.local" &&
        document.querySelector("input[name=gg]:checked")?.value === "F",
      JSON.stringify(res.results)
    );
    check("Fill: unapproved field untouched", $("t2").value === "");
    check("Fill: protected item approved anyway → not_approvable, untouched", resultOf(res, p, "t9")?.reason === "not_approvable" && $("t9").value === "");
    check("Fill: id outside the preview → not_in_preview", res.results.some((r) => r.id === "f999" && r.reason === "not_in_preview"));
    check("Fill: input + change events dispatched for frameworks", counts.input >= 4 && counts.change >= 5, JSON.stringify(counts));
    check("Fill: no submit and no button click", counts.submit === 0 && counts.click === 0, JSON.stringify(counts));
    check("Fill: summary counts", res.summary.filled === 6 && res.summary.skipped === 2 && res.summary.failed === 0, JSON.stringify(res.summary));

    // 8. Fill-time re-verification (page changed after the preview)
    mount(`
      <label for="d1" id="d1l">Full Name</label><input id="d1">
      <label for="d2">Father's Name</label><input id="d2">
      <label for="d3">Mother's Name</label><input id="d3">
      <label for="d4">Religion</label><input id="d4">
      <div id="d5w"><label for="d5">Email ID</label><input id="d5" type="email"></div>
      <label for="d6">Category</label><select id="d6"><option value="">Select</option><option value="g">General</option></select>
      <label for="d7">Marital Status</label><select id="d7"><option value="">Select</option><option value="m">Married</option></select>`);
    p = planFor();
    $("d1l").textContent = "Guardian's Name"; // relabelled
    $("d2").remove(); // removed
    $("d3").disabled = true; // locked
    $("d4").style.display = "none"; // hidden
    $("d5w").insertAdjacentHTML("afterbegin", '<img alt="captcha" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'); // CAPTCHA appeared
    $("d6").replaceChildren(new Option("Select", "")); // option gone
    const late = document.createElement("input");
    late.setAttribute("aria-label", "Nationality");
    lab.append(late); // added after the preview
    res = await E.dom.fill(p.plan, p.refs, p.plan.items.map((i) => i.id), { settleMs: 0 });
    const reasons = Object.fromEntries(["d1", "d2", "d3", "d4", "d5", "d6", "d7"].map((id) => [id, resultOf(res, p, id)?.status === "filled" ? "filled" : resultOf(res, p, id)?.reason]));
    check(
      "Fill re-verification: relabelled/removed → form_changed, disabled → locked, hidden → hidden, CAPTCHA → protected, option gone → option_unavailable",
      reasons.d1 === "form_changed" && reasons.d2 === "form_changed" && reasons.d3 === "locked" && reasons.d4 === "hidden" && reasons.d5 === "protected" &&
        reasons.d6 === "option_unavailable" && reasons.d7 === "filled",
      JSON.stringify(reasons)
    );
    check("Fill re-verification: nothing written to changed fields; late field untouched", $("d1").value === "" && $("d3").value === "" && $("d5").value === "" && late.value === "");
    mount(`
      <label for="k1">Mobile Number</label><input id="k1" maxlength="10">
      <label for="k2">Full Name</label><input id="k2">
      <label for="k3">Father's Name</label><input id="k3">`);
    p = planFor();
    $("k1").maxLength = 5; // limit tightened after the preview (a scripted value would bypass it)
    $("k2").setAttribute("pattern", "[0-9]+"); // pattern added after the preview
    res = await E.dom.fill(p.plan, p.refs, p.plan.items.filter((i) => i.status === "ready").map((i) => i.id), { settleMs: 0 });
    check(
      "Fill re-verification: maximum length tightened or pattern added after the preview → form_changed, nothing written; unchanged field filled",
      resultOf(res, p, "k1")?.reason === "form_changed" && resultOf(res, p, "k2")?.reason === "form_changed" && resultOf(res, p, "k3")?.status === "filled" && $("k1").value === "" && $("k2").value === "",
      JSON.stringify(res.results)
    );

    // 9. Guard: a forged 'checkbox' item pointing at a button is refused (never clicked)
    mount(`<button type="button" id="b1" aria-label="Full Name">Pay</button><label for="fi">Upload photo</label><input id="fi" type="file">`);
    let clicks = 0;
    $("b1").addEventListener("click", () => (clicks += 1));
    const btn = E.dom.describe($("b1"), "f1");
    const file = E.dom.describe($("fi"), "f2");
    res = await E.dom.fill(
      { items: [{ id: "f1", status: "ready", kind: "checkbox", value: true }, { id: "f2", status: "ready", kind: "text", value: "C:\\fake.jpg" }], signatures: { f1: btn.signature, f2: file.signature } },
      new Map([["f1", { el: $("b1") }], ["f2", { el: $("fi") }]]),
      ["f1", "f2"],
      { settleMs: 0 }
    );
    check("Guard: forged checkbox item on a <button> fails without clicking", res.results[0].status === "failed" && clicks === 0, JSON.stringify(res.results[0]));
    check("Guard: forged text item on a file input is refused as protected", res.results[1].reason === "protected" && $("fi").files.length === 0, JSON.stringify(res.results[1]));

    // 10. Duplicate fields and unsupported controls
    mount(`
      <label for="m1">Mobile Number</label><input id="m1" type="tel">
      <label for="m2">Mobile Number</label><input id="m2" type="tel">
      <div contenteditable="true" aria-label="Full Name" id="ce"></div>
      <input type="range" aria-label="Height" id="rg">
      <select multiple aria-label="Category" id="ms"><option>General</option></select>`);
    p = planFor();
    check("Plan: duplicate mobile fields → first ready, second duplicate", itemOf(p, "m1")?.status === "ready" && itemOf(p, "m2")?.status === "duplicate");
    check("Plan: contenteditable / range / multi-select → unsupported", ["ce", "rg", "ms"].every((id) => itemOf(p, id)?.status === "unsupported"), p.plan.items.map((i) => `${i.label}:${i.status}`).join(","));

    lab.replaceChildren();
    return results;
  }

  window.runEngineLab = () => run().catch((e) => [...results, { name: "Engine lab crashed", ok: false, detail: String(e && e.message) }]);
})();
