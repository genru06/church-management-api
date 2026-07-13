import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { Public } from "../../shared/public.decorator";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  add(@Body() body: any) {
    return this.eventsService.add(body);
  }

  @Get()
  list() {
    return this.eventsService.list();
  }

  @Public()
  @Get(":id/signup")
  getSignupInfo(@Param("id") id: string) {
    return this.eventsService.getSignupInfo(Number(id));
  }

  @Public()
  @Post(":id/signup")
  publicSignup(@Param("id") id: string, @Body() body: any) {
    return this.eventsService.publicSignup(Number(id), body);
  }

  @Get(":id/dashboard")
  dashboard(@Param("id") id: string) {
    return this.eventsService.dashboard(Number(id));
  }

  @Get(":id/participants")
  listParticipants(@Param("id") id: string) {
    return this.eventsService.listParticipants(Number(id));
  }

  @Get(":id/pledges")
  listPledges(@Param("id") id: string) {
    return this.eventsService.listPledges(Number(id));
  }

  @Get(":id")
  view(@Param("id") id: string) {
    return this.eventsService.view(Number(id));
  }

  @Put(":id")
  edit(@Param("id") id: string, @Body() body: any) {
    return this.eventsService.edit(Number(id), body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.eventsService.remove(Number(id));
  }

  @Post(":id/participants")
  addParticipant(@Param("id") id: string, @Body() body: any) {
    return this.eventsService.addParticipant(Number(id), body);
  }

  @Post(":id/participants/import")
  importParticipantsBulk(@Param("id") id: string, @Body() body: any) {
    return this.eventsService.importParticipantsBulk(Number(id), body);
  }

  @Put(":id/participants/:participantId")
  editParticipant(
    @Param("id") id: string,
    @Param("participantId") participantId: string,
    @Body() body: any
  ) {
    return this.eventsService.editParticipant(Number(id), Number(participantId), body);
  }

  @Delete(":id/participants/:participantId")
  removeParticipant(@Param("id") id: string, @Param("participantId") participantId: string) {
    return this.eventsService.removeParticipant(Number(id), Number(participantId));
  }

  @Post(":id/checkin")
  checkIn(@Param("id") id: string, @Body() body: any) {
    return this.eventsService.checkIn(Number(id), body);
  }

  @Post(":id/participants/:participantId/pay")
  payRegistration(
    @Param("id") id: string,
    @Param("participantId") participantId: string,
    @Body() body: any
  ) {
    return this.eventsService.payRegistration(Number(id), Number(participantId), body);
  }

  @Post(":id/pledges")
  addPledge(@Param("id") id: string, @Body() body: any) {
    return this.eventsService.addPledge(Number(id), body);
  }

  @Put(":id/pledges/:pledgeId")
  editPledge(@Param("id") id: string, @Param("pledgeId") pledgeId: string, @Body() body: any) {
    return this.eventsService.editPledge(Number(id), Number(pledgeId), body);
  }

  @Delete(":id/pledges/:pledgeId")
  removePledge(@Param("id") id: string, @Param("pledgeId") pledgeId: string) {
    return this.eventsService.removePledge(Number(id), Number(pledgeId));
  }
}
