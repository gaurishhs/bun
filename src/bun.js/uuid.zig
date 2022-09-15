//https://github.com/dmgk/zig-uuid
const std = @import("std");
const crypto = std.crypto;
const fmt = std.fmt;
const testing = std.testing;
const bun = @import("../global.zig");

pub const Error = error{InvalidUUID};
const UUID = @This();

bytes: [16]u8 = undefined,

pub fn init() UUID {
    var uuid = UUID{ .bytes = undefined };

    bun.rand(&uuid.bytes);
    // Version 4
    uuid.bytes[6] = (uuid.bytes[6] & 0x0f) | 0x40;
    // Variant 1
    uuid.bytes[8] = (uuid.bytes[8] & 0x3f) | 0x80;
    return uuid;
}

// Indices in the UUID string representation for each byte.
const encoded_pos = [16]u8{ 0, 2, 4, 6, 9, 11, 14, 16, 19, 21, 24, 26, 28, 30, 32, 34 };

// Hex to nibble mapping.
const hex_to_nibble = [256]u8{
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
};

pub fn format(
    self: UUID,
    comptime layout: []const u8,
    options: fmt.FormatOptions,
    writer: anytype,
) !void {
    _ = options; // currently unused

    if (comptime layout.len != 0 and layout[0] != 's')
        @compileError("Unsupported format specifier for UUID type: '" ++ layout ++ "'.");
    var buf: [36]u8 = undefined;
    self.print(&buf);

    try fmt.format(writer, "{s}", .{buf});
}

pub fn print(
    self: UUID,
    buf: *[36]u8,
) void {
    const hex = "0123456789abcdef";
    const bytes = self.bytes;

    buf[8] = '-';
    buf[13] = '-';
    buf[18] = '-';
    buf[23] = '-';
    inline for (encoded_pos) |i, j| {
        buf[comptime i + 0] = hex[bytes[j] >> 4];
        buf[comptime i + 1] = hex[bytes[j] & 0x0f];
    }
}

pub fn parse(buf: []const u8) Error!UUID {
    var uuid = UUID{ .bytes = undefined };

    if (buf.len != 36 or buf[8] != '-' or buf[13] != '-' or buf[18] != '-' or buf[23] != '-')
        return Error.InvalidUUID;

    inline for (encoded_pos) |i, j| {
        const hi = hex_to_nibble[buf[i + 0]];
        const lo = hex_to_nibble[buf[i + 1]];
        if (hi == 0xff or lo == 0xff) {
            return Error.InvalidUUID;
        }
        uuid.bytes[j] = hi << 4 | lo;
    }

    return uuid;
}

// Zero UUID
pub const zero: UUID = .{ .bytes = .{0} ** 16 };

// Convenience function to return a new v4 UUID.
pub fn newV4() UUID {
    return UUID.init();
}
