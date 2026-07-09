import { Body, Controller, Get, Post } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";

@Controller("attendance")
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  list() {
    return this.attendanceService.list();
  }

  @Post()
  add(@Body() body: any) {
    return this.attendanceService.add(body);
  }
}
