import { Injectable, NotFoundException } from "@nestjs/common";
import * as QRCode from "qrcode";
import { ChurchesService } from "../churches/churches.service";
import { MembersService } from "../members/members.service";
import { getChurchDisplayName } from "../../utils/church-display";

@Injectable()
export class PrintService {
  constructor(
    private readonly churchesService: ChurchesService,
    private readonly membersService: MembersService
  ) {}

  async buildChurchMembersHtml(churchId: number) {
    const church = await this.churchesService.view(churchId);
    if (!church) throw new NotFoundException("Church not found");

    let members = await this.churchesService.listMembers(churchId);
    members = await Promise.all(
      members.map(async (member) => {
        if (member.qrToken) return member;
        try {
          const full = await this.membersService.view(Number(member.id));
          return { ...member, qrToken: full.qrToken };
        } catch {
          return member;
        }
      })
    );

    const title = getChurchDisplayName(church) || church.name || "Church";
    const rows = await Promise.all(
      members.map(async (member) => {
        const name = `${member.lastName || ""}, ${member.firstName || ""}`.replace(/^,\s*|,\s*$/g, "") || "—";
        let qrImg = "";
        if (member.qrToken) {
          const payload = JSON.stringify({
            type: "member",
            memberId: Number(member.id),
            token: member.qrToken
          });
          const dataUrl = await QRCode.toDataURL(payload, { width: 160, margin: 1 });
          qrImg = `<img src="${dataUrl}" width="72" height="72" alt="QR" />`;
        }
        return `<tr>
  <td class="qr">${qrImg}</td>
  <td>${escapeHtml(member.lastName || "—")}</td>
  <td>${escapeHtml(member.firstName || "—")}</td>
  <td>${escapeHtml(member.lifeGroup || "—")}</td>
</tr>`;
      })
    );

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Member list</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #1a1a2e; }
    h1 { font-size: 18px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .03em; }
    .meta { font-size: 13px; color: #4b5563; margin: 0 0 18px; }
    .toolbar { margin-bottom: 16px; }
    .toolbar button { font-size: 14px; padding: 8px 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #9ca3af; padding: 8px 10px; text-align: left; vertical-align: middle; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; background: #f3f4f6; }
    td.qr { width: 88px; text-align: center; }
    @media print {
      .toolbar { display: none !important; }
      body { margin: 0; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <h1>LG Network Church Member List</h1>
  <p class="meta">Church: ${escapeHtml(title)} · ${members.length} member(s)</p>
  <table>
    <thead>
      <tr>
        <th>QR Code</th>
        <th>Last Name</th>
        <th>First Name</th>
        <th>LifeGroup</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join("\n") || `<tr><td colspan="4">No members</td></tr>`}
    </tbody>
  </table>
  <script>window.addEventListener("load", function () { /* ready to print */ });</script>
</body>
</html>`;
  }
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
