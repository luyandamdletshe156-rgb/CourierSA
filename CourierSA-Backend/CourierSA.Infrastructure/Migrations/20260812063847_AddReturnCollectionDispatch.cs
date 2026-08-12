using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CourierSA.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReturnCollectionDispatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AssignedDriverId",
                table: "ReturnRequests",
                type: "char(36)",
                nullable: true,
                collation: "ascii_general_ci");

            migrationBuilder.AddColumn<DateTime>(
                name: "CollectedAt",
                table: "ReturnRequests",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DispatchedAt",
                table: "ReturnRequests",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReturnRequests_AssignedDriverId",
                table: "ReturnRequests",
                column: "AssignedDriverId");

            migrationBuilder.AddForeignKey(
                name: "FK_ReturnRequests_DriverProfiles_AssignedDriverId",
                table: "ReturnRequests",
                column: "AssignedDriverId",
                principalTable: "DriverProfiles",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ReturnRequests_DriverProfiles_AssignedDriverId",
                table: "ReturnRequests");

            migrationBuilder.DropIndex(
                name: "IX_ReturnRequests_AssignedDriverId",
                table: "ReturnRequests");

            migrationBuilder.DropColumn(
                name: "AssignedDriverId",
                table: "ReturnRequests");

            migrationBuilder.DropColumn(
                name: "CollectedAt",
                table: "ReturnRequests");

            migrationBuilder.DropColumn(
                name: "DispatchedAt",
                table: "ReturnRequests");
        }
    }
}
