import { Controller, Get, Param, Query, Res, UnauthorizedException } from "@nestjs/common";
import { Response } from "express";
import { Public } from "../../shared/public.decorator";
import { PrintService } from "./print.service";

@Controller("print")
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  /**
   * Browser-friendly member print sheet (QR + names).
   * Uses PRINT_KEY so it works even when the PWA UI is stuck on an old cache.
   * Example: /print/churches/48/members?key=...
   */
  @Public()
  @Get("churches/:id/members")
  async churchMembers(
    @Param("id") id: string,
    @Query("key") key: string | undefined,
    @Res() res: Response
  ) {
    const expected = process.env.PRINT_KEY || "";
    if (!expected || key !== expected) {
      throw new UnauthorizedException("Print key required");
    }

    const html = await this.printService.buildChurchMembersHtml(Number(id));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  }
}
