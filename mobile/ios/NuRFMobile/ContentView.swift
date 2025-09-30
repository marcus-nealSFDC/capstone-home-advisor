import SwiftUI

struct ContentView: View {
    @StateObject var client = AgentClient()
    @State var input = ""

    var body: some View {
        VStack {
            List(client.messages, id: \.self) { Text($0) }
            HStack {
                TextField("Type…", text: $input)
                    .textFieldStyle(.roundedBorder)
                Button("Send") {
                    if client.sessionId == nil { client.startSession() }
                    client.sendStreaming(input)
                    input = ""
                }
            }.padding()
        }
        .onAppear { client.startSession() }
    }
}
